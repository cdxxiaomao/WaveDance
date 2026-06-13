use std::io::Write;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use wavedance::audio_processing::WaveformFrame;
use wavedance::esp_display::{encode_waveform_frame, EncodeOptions};

const DEFAULT_BAUD: u32 = 921600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EspDisplayConfig {
    pub enabled: bool,
    pub serial_path: String,
    pub baud_rate: u32,
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
            serial_path: String::new(),
            baud_rate: DEFAULT_BAUD,
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
    pub ok: bool,
    pub message: String,
    pub last_sent_at_ms: Option<u64>,
    pub frames_sent: u64,
    pub last_seq: u16,
}

pub struct EspDisplayBridge {
    pub config: EspDisplayConfig,
    seq: u16,
    last_send: Option<Instant>,
    port: Option<Box<dyn serialport::SerialPort>>,
    connected: bool,
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
            connected: false,
            last_error: None,
            last_sent_at: None,
            frames_sent: 0,
        }
    }
}

impl EspDisplayBridge {
    pub fn status(&self) -> EspDisplayStatus {
        let message = if self.connected {
            "串口已连接".to_string()
        } else if let Some(err) = &self.last_error {
            err.clone()
        } else if self.config.enabled && self.config.serial_path.is_empty() {
            "请选择串口".to_string()
        } else {
            "未连接".to_string()
        };

        EspDisplayStatus {
            connected: self.connected,
            ok: self.connected && self.last_error.is_none(),
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
        if let Some(path) = patch.serial_path {
            self.config.serial_path = path.trim().to_string();
        }
        if let Some(baud) = patch.baud_rate {
            if baud < 9600 || baud > 2_000_000 {
                return Err("波特率须在 9600~2000000 之间".to_string());
            }
            self.config.baud_rate = baud;
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

        self.close_port();
        if self.config.enabled && !self.config.serial_path.is_empty() {
            self.open_port()?;
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

    fn open_port(&mut self) -> Result<(), String> {
        let path = self.config.serial_path.trim();
        if path.is_empty() {
            return Err("串口路径为空".to_string());
        }
        let port = serialport::new(path, self.config.baud_rate)
            .timeout(Duration::from_millis(15))
            .open()
            .map_err(|e| format!("打开串口失败: {e}"))?;
        self.port = Some(port);
        self.connected = true;
        self.last_error = None;
        Ok(())
    }

    fn close_port(&mut self) {
        self.port = None;
        self.connected = false;
    }

    fn write_frame(&mut self, bytes: &[u8]) -> Result<(), String> {
        if !self.config.enabled {
            return Ok(());
        }
        if self.port.is_none() {
            if self.config.serial_path.is_empty() {
                return Err("未选择串口".to_string());
            }
            self.open_port()?;
        }
        let port = self.port.as_mut().expect("port opened");
        match port.write_all(bytes) {
            Ok(_) => {
                self.connected = true;
                self.last_error = None;
                self.last_sent_at = Some(SystemTime::now());
                self.frames_sent += 1;
                Ok(())
            }
            Err(err) => {
                self.last_error = Some(format!("串口写入失败: {err}"));
                self.close_port();
                Err(self.last_error.clone().unwrap())
            }
        }
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
