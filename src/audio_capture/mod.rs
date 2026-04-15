use std::collections::VecDeque;
use std::f32::consts::PI;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct AudioFrame {
    pub sample_rate: u32,
    pub channels: u16,
    pub samples: Vec<f32>,
}

#[derive(Debug, Error)]
pub enum AudioSourceError {
    #[error("audio source is not started")]
    NotStarted,
    #[error("audio device is not available: {0}")]
    DeviceUnavailable(String),
    #[error("audio stream error: {0}")]
    StreamError(String),
    #[error("audio read timeout")]
    ReadTimeout,
}

pub trait AudioSource {
    fn start(&mut self) -> Result<(), AudioSourceError>;
    fn read_frame(&mut self, frame_size: usize) -> Result<AudioFrame, AudioSourceError>;
    fn stop(&mut self) -> Result<(), AudioSourceError>;
}

#[derive(Debug)]
pub struct MockAudioSource {
    sample_rate: u32,
    channels: u16,
    frequency_hz: f32,
    amplitude: f32,
    phase: f32,
    started: bool,
}

impl MockAudioSource {
    pub fn new(sample_rate: u32, channels: u16, frequency_hz: f32, amplitude: f32) -> Self {
        Self {
            sample_rate,
            channels,
            frequency_hz,
            amplitude,
            phase: 0.0,
            started: false,
        }
    }
}

impl AudioSource for MockAudioSource {
    fn start(&mut self) -> Result<(), AudioSourceError> {
        self.started = true;
        Ok(())
    }

    fn read_frame(&mut self, frame_size: usize) -> Result<AudioFrame, AudioSourceError> {
        if !self.started {
            return Err(AudioSourceError::NotStarted);
        }

        let mut samples = Vec::with_capacity(frame_size * self.channels as usize);
        let phase_step = 2.0 * PI * self.frequency_hz / self.sample_rate as f32;

        for _ in 0..frame_size {
            let value = self.amplitude * self.phase.sin();
            self.phase += phase_step;
            if self.phase >= 2.0 * PI {
                self.phase -= 2.0 * PI;
            }
            for _ in 0..self.channels {
                samples.push(value);
            }
        }

        Ok(AudioFrame {
            sample_rate: self.sample_rate,
            channels: self.channels,
            samples,
        })
    }

    fn stop(&mut self) -> Result<(), AudioSourceError> {
        self.started = false;
        Ok(())
    }
}

pub struct MacSystemAudioSource {
    preferred_device_keyword: Option<String>,
    sample_rate: u32,
    channels: u16,
    started: bool,
    sample_buffer: Arc<Mutex<VecDeque<f32>>>,
    stream: Option<cpal::Stream>,
}

impl MacSystemAudioSource {
    const MAX_BUFFER_MS: usize = 240;
    const MAX_BACKLOG_FRAMES: usize = 2;

    pub fn new(preferred_device_keyword: Option<String>) -> Self {
        Self {
            preferred_device_keyword,
            sample_rate: 48_000,
            channels: 2,
            started: false,
            sample_buffer: Arc::new(Mutex::new(VecDeque::with_capacity(48_000))),
            stream: None,
        }
    }

    fn pick_input_device(host: &cpal::Host, keyword: Option<&str>) -> Result<cpal::Device, AudioSourceError> {
        if let Some(key) = keyword {
            let key = key.to_lowercase();
            if let Ok(mut devices) = host.input_devices() {
                if let Some(device) = devices.find(|dev| {
                    dev.name()
                        .map(|n| n.to_lowercase().contains(&key))
                        .unwrap_or(false)
                }) {
                    return Ok(device);
                }
            }
        }

        host.default_input_device().ok_or_else(|| {
            AudioSourceError::DeviceUnavailable("未找到可用输入设备，请确认 BlackHole 或系统输入设备可用".to_string())
        })
    }
}

impl AudioSource for MacSystemAudioSource {
    fn start(&mut self) -> Result<(), AudioSourceError> {
        if self.started {
            return Ok(());
        }

        let host = cpal::default_host();
        let device = Self::pick_input_device(&host, self.preferred_device_keyword.as_deref())?;
        let config = device
            .default_input_config()
            .map_err(|e| AudioSourceError::StreamError(format!("无法读取输入配置: {e}")))?;

        self.sample_rate = config.sample_rate().0;
        self.channels = config.channels();
        let max_keep_samples = (self.sample_rate as usize * self.channels as usize * Self::MAX_BUFFER_MS) / 1000;

        let buffer = Arc::clone(&self.sample_buffer);
        let err_fn = |err| eprintln!("音频输入流异常: {err}");

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device
                .build_input_stream(
                    &config.clone().into(),
                    move |data: &[f32], _| {
                        if let Ok(mut q) = buffer.lock() {
                            q.extend(data.iter().copied());
                            while q.len() > max_keep_samples {
                                q.pop_front();
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| AudioSourceError::StreamError(format!("创建 F32 输入流失败: {e}")))?,
            cpal::SampleFormat::I16 => {
                let buffer = Arc::clone(&self.sample_buffer);
                device
                    .build_input_stream(
                        &config.clone().into(),
                        move |data: &[i16], _| {
                            if let Ok(mut q) = buffer.lock() {
                                q.extend(data.iter().map(|v| *v as f32 / i16::MAX as f32));
                                while q.len() > max_keep_samples {
                                    q.pop_front();
                                }
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| AudioSourceError::StreamError(format!("创建 I16 输入流失败: {e}")))?
            }
            cpal::SampleFormat::U16 => {
                let buffer = Arc::clone(&self.sample_buffer);
                device
                    .build_input_stream(
                        &config.into(),
                        move |data: &[u16], _| {
                            if let Ok(mut q) = buffer.lock() {
                                q.extend(
                                    data.iter()
                                        .map(|v| (*v as f32 / u16::MAX as f32) * 2.0 - 1.0),
                                );
                                while q.len() > max_keep_samples {
                                    q.pop_front();
                                }
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| AudioSourceError::StreamError(format!("创建 U16 输入流失败: {e}")))?
            }
            other => {
                return Err(AudioSourceError::StreamError(format!(
                    "暂不支持的采样格式: {other:?}"
                )));
            }
        };

        stream
            .play()
            .map_err(|e| AudioSourceError::StreamError(format!("启动输入流失败: {e}")))?;

        self.stream = Some(stream);
        self.started = true;
        Ok(())
    }

    fn read_frame(&mut self, frame_size: usize) -> Result<AudioFrame, AudioSourceError> {
        if !self.started {
            return Err(AudioSourceError::NotStarted);
        }

        let needed = frame_size * self.channels as usize;
        let deadline = Instant::now() + Duration::from_millis(800);

        loop {
            if let Ok(mut q) = self.sample_buffer.lock() {
                if q.len() >= needed {
                    // 低延迟优先：如果积压过多，主动丢弃旧数据，仅保留最近少量帧。
                    let max_backlog_samples = needed * Self::MAX_BACKLOG_FRAMES;
                    while q.len() > max_backlog_samples {
                        q.pop_front();
                    }
                    let mut out = Vec::with_capacity(needed);
                    for _ in 0..needed {
                        if let Some(v) = q.pop_front() {
                            out.push(v);
                        }
                    }
                    return Ok(AudioFrame {
                        sample_rate: self.sample_rate,
                        channels: self.channels,
                        samples: out,
                    });
                }
            }

            if Instant::now() >= deadline {
                return Err(AudioSourceError::ReadTimeout);
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    fn stop(&mut self) -> Result<(), AudioSourceError> {
        self.started = false;
        self.stream = None;
        Ok(())
    }
}
