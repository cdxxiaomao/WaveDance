use std::io::Write;
use std::net::{SocketAddr, UdpSocket};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use wavedance::audio_processing::WaveformFrame;
use wavedance::esp_display::{encode_waveform_frame, EncodeOptions};

const DEFAULT_BAUD: u32 = 921600;
const DEFAULT_UDP_PORT: u16 = 47001;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EspTransportMode {
    Serial,
    Udp,
    Both,
}

impl Default for EspTransportMode {
    fn default() -> Self {
        Self::Serial
    }
}

impl EspTransportMode {
    pub fn uses_serial(self) -> bool {
        matches!(self, Self::Serial | Self::Both)
    }

    pub fn uses_udp(self) -> bool {
        matches!(self, Self::Udp | Self::Both)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EspDisplayConfig {
    pub enabled: bool,
    pub transport: EspTransportMode,
    pub serial_path: String,
    pub baud_rate: u32,
    pub udp_host: String,
    pub udp_port: u16,
    pub max_fps: u32,
    pub bucket_count: usize,
    pub include_time_samples: bool,
    pub time_sample_count: usize,
    pub freq_reversed: bool,
}

impl Default for EspDisplayConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            transport: EspTransportMode::Serial,
            serial_path: String::new(),
            baud_rate: DEFAULT_BAUD,
            udp_host: String::new(),
            udp_port: DEFAULT_UDP_PORT,
            max_fps: 30,
            bucket_count: 32,
            include_time_samples: false,
            time_sample_count: 128,
            freq_reversed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct EspDisplayStatus {
    pub connected: bool,
    pub serial_connected: bool,
    pub udp_connected: bool,
    pub ok: bool,
    pub message: String,
    pub last_sent_at_ms: Option<u64>,
    pub frames_sent: u64,
    pub last_seq: u16,
}

struct UdpTarget {
    socket: UdpSocket,
    addr: SocketAddr,
}

pub struct EspDisplayBridge {
    pub config: EspDisplayConfig,
    seq: u16,
    last_send: Option<Instant>,
    port: Option<Box<dyn serialport::SerialPort>>,
    udp: Option<UdpTarget>,
    serial_connected: bool,
    udp_connected: bool,
    last_error: Option<String>,
    last_sent_at: Option<SystemTime>,
    frames_sent: u64,
}

impl Default for EspDisplayBridge {
    fn default() -> Self {
        Self {
            config: EspDisplayConfig::default(),
            seq: 0,
            last_send: None,
            port: None,
            udp: None,
            serial_connected: false,
            udp_connected: false,
            last_error: None,
            last_sent_at: None,
            frames_sent: 0,
        }
    }
}

impl EspDisplayBridge {
    fn any_connected(&self) -> bool {
        let t = self.config.transport;
        (t.uses_serial() && self.serial_connected) || (t.uses_udp() && self.udp_connected)
    }

    fn status_message(&self) -> String {
        if let Some(err) = &self.last_error {
            return err.clone();
        }

        let t = self.config.transport;
        let mut parts: Vec<String> = Vec::new();

        if t.uses_serial() {
            if self.serial_connected {
                parts.push("串口已连接".to_string());
            } else if self.config.serial_path.is_empty() {
                parts.push("请选择串口".to_string());
            } else {
                parts.push("串口未连接".to_string());
            }
        }

        if t.uses_udp() {
            if self.udp_connected {
                parts.push(format!(
                    "UDP → {}:{}",
                    self.config.udp_host.trim(),
                    self.config.udp_port
                ));
            } else if self.config.udp_host.trim().is_empty() {
                parts.push("请填写 ESP IP".to_string());
            } else {
                parts.push("UDP 未就绪".to_string());
            }
        }

        if parts.is_empty() {
            "未连接".to_string()
        } else {
            parts.join(" · ")
        }
    }

    pub fn status(&self) -> EspDisplayStatus {
        let connected = self.any_connected();
        let message = self.status_message();

        EspDisplayStatus {
            connected,
            serial_connected: self.serial_connected,
            udp_connected: self.udp_connected,
            ok: connected && self.last_error.is_none(),
            message,
            last_sent_at_ms: self
                .last_sent_at
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
            frames_sent: self.frames_sent,
            last_seq: self.seq,
        }
    }

    pub fn apply_patch(
        &mut self,
        patch: super::EspDisplayConfigInput,
    ) -> Result<(), String> {
        if let Some(enabled) = patch.enabled {
            self.config.enabled = enabled;
        }
        if let Some(transport) = patch.transport {
            self.config.transport = transport;
        }
        if let Some(path) = patch.serial_path {
            self.config.serial_path = path.trim().to_string();
        }
        if let Some(baud) = patch.baud_rate {
            if baud < 9600 || baud > 2_000_000 {
                return Err("波特率须在 9600~2000000 之间".to_string());
            }
            self.config.baud_rate = baud;
        }
        if let Some(host) = patch.udp_host {
            self.config.udp_host = host.trim().to_string();
        }
        if let Some(port) = patch.udp_port {
            if port == 0 {
                return Err("UDP 端口不能为 0".to_string());
            }
            self.config.udp_port = port;
        }
        if let Some(max_fps) = patch.max_fps {
            if !(1..=120).contains(&max_fps) {
                return Err("推送帧率须在 1~120 之间".to_string());
            }
            self.config.max_fps = max_fps;
        }
        if let Some(bucket_count) = patch.bucket_count {
            if !(8..=64).contains(&bucket_count) {
                return Err("ESP 频谱桶数须在 8~64 之间".to_string());
            }
            self.config.bucket_count = bucket_count;
        }
        if let Some(include) = patch.include_time_samples {
            self.config.include_time_samples = include;
        }
        if let Some(count) = patch.time_sample_count {
            if !(64..=256).contains(&count) {
                return Err("时域点数须在 64~256 之间".to_string());
            }
            self.config.time_sample_count = count;
        }
        if let Some(reversed) = patch.freq_reversed {
            self.config.freq_reversed = reversed;
        }

        self.close_transports();
        if self.config.enabled {
            self.open_transports()?;
        }
        Ok(())
    }

    fn encode_options(&self) -> EncodeOptions {
        EncodeOptions {
            freq_reversed: self.config.freq_reversed,
            include_time_samples: self.config.include_time_samples,
            time_sample_count: self.config.time_sample_count,
            silence_peak_gate: wavedance::esp_display::protocol::DEFAULT_SILENCE_PEAK_GATE,
            silence_rms_gate: wavedance::esp_display::protocol::DEFAULT_SILENCE_RMS_GATE,
        }
    }

    fn open_transports(&mut self) -> Result<(), String> {
        let mut errors: Vec<String> = Vec::new();

        if self.config.transport.uses_serial() && !self.config.serial_path.is_empty() {
            if let Err(err) = self.open_serial_port() {
                errors.push(err);
            }
        }

        if self.config.transport.uses_udp() && !self.config.udp_host.is_empty() {
            if let Err(err) = self.open_udp() {
                errors.push(err);
            }
        }

        if errors.is_empty() {
            self.last_error = None;
            Ok(())
        } else {
            let msg = errors.join("；");
            self.last_error = Some(msg.clone());
            Err(msg)
        }
    }

    fn open_serial_port(&mut self) -> Result<(), String> {
        let path = self.config.serial_path.trim();
        if path.is_empty() {
            return Err("串口路径为空".to_string());
        }
        let port = serialport::new(path, self.config.baud_rate)
            .timeout(Duration::from_millis(15))
            .open()
            .map_err(|e| format!("打开串口失败: {e}"))?;
        self.port = Some(port);
        self.serial_connected = true;
        Ok(())
    }

    fn open_udp(&mut self) -> Result<(), String> {
        let host = self.config.udp_host.trim();
        if host.is_empty() {
            return Err("UDP 目标 IP 为空".to_string());
        }
        let addr: SocketAddr = format!("{}:{}", host, self.config.udp_port)
            .parse()
            .map_err(|e| format!("UDP 地址无效: {e}"))?;
        let socket = UdpSocket::bind("0.0.0.0:0")
            .map_err(|e| format!("绑定 UDP 失败: {e}"))?;
        self.udp = Some(UdpTarget { socket, addr });
        self.udp_connected = true;
        Ok(())
    }

    fn close_transports(&mut self) {
        self.port = None;
        self.udp = None;
        self.serial_connected = false;
        self.udp_connected = false;
    }

    fn write_serial(&mut self, bytes: &[u8]) -> Result<(), String> {
        if self.port.is_none() {
            if self.config.serial_path.is_empty() {
                return Err("未选择串口".to_string());
            }
            self.open_serial_port()?;
        }
        let port = self.port.as_mut().expect("serial port opened");
        match port.write_all(bytes) {
            Ok(_) => {
                self.serial_connected = true;
                Ok(())
            }
            Err(err) => {
                self.serial_connected = false;
                self.port = None;
                Err(format!("串口写入失败: {err}"))
            }
        }
    }

    fn write_udp(&mut self, bytes: &[u8]) -> Result<(), String> {
        if self.udp.is_none() {
            if self.config.udp_host.is_empty() {
                return Err("未填写 ESP IP".to_string());
            }
            self.open_udp()?;
        }
        let udp = self.udp.as_ref().expect("udp opened");
        match udp.socket.send_to(bytes, udp.addr) {
            Ok(_) => {
                self.udp_connected = true;
                Ok(())
            }
            Err(err) => {
                self.udp_connected = false;
                self.udp = None;
                Err(format!("UDP 发送失败: {err}"))
            }
        }
    }

    fn dispatch_frame(&mut self, bytes: &[u8]) -> Result<(), String> {
        if !self.config.enabled {
            return Ok(());
        }

        let t = self.config.transport;
        let mut any_ok = false;
        let mut errors: Vec<String> = Vec::new();

        if t.uses_serial() {
            match self.write_serial(bytes) {
                Ok(()) => any_ok = true,
                Err(err) => errors.push(err),
            }
        }

        if t.uses_udp() {
            match self.write_udp(bytes) {
                Ok(()) => any_ok = true,
                Err(err) => errors.push(err),
            }
        }

        if any_ok {
            self.last_error = None;
            self.last_sent_at = Some(SystemTime::now());
            self.frames_sent += 1;
            Ok(())
        } else if errors.is_empty() {
            Err("未配置传输通道".to_string())
        } else {
            let msg = errors.join("；");
            self.last_error = Some(msg.clone());
            Err(msg)
        }
    }

    fn write_frame(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.dispatch_frame(bytes)
    }

    pub fn send_test_frame(&mut self) -> Result<(), String> {
        let points: Vec<f32> = (0..self.config.bucket_count)
            .map(|i| (i as f32 + 1.0) / self.config.bucket_count as f32)
            .collect();
        let frame = WaveformFrame {
            peak: 0.8,
            rms: 0.5,
            points,
            time_samples: vec![],
        };
        self.seq = self.seq.wrapping_add(1);
        let bytes = encode_waveform_frame(
            self.seq,
            &frame,
            self.config.bucket_count,
            &self.encode_options(),
        )?;
        self.write_frame(&bytes)?;
        Ok(())
    }

    pub fn maybe_send(&mut self, frame: &WaveformFrame) -> Option<EspDisplayStatus> {
        if !self.config.enabled {
            return None;
        }

        let max_fps = self.config.max_fps.max(1);
        let min_interval = Duration::from_secs_f64(1.0 / max_fps as f64);
        if let Some(last) = self.last_send {
            if last.elapsed() < min_interval {
                return None;
            }
        }

        self.seq = self.seq.wrapping_add(1);
        let bytes = match encode_waveform_frame(
            self.seq,
            frame,
            self.config.bucket_count,
            &self.encode_options(),
        ) {
            Ok(b) => b,
            Err(err) => {
                self.last_error = Some(err);
                return Some(self.status());
            }
        };

        let status_changed = match self.write_frame(&bytes) {
            Ok(()) => {
                self.last_send = Some(Instant::now());
                false
            }
            Err(_) => true,
        };

        if status_changed {
            Some(self.status())
        } else {
            None
        }
    }
}
