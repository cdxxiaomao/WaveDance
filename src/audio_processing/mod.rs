use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

use crate::audio_capture::AudioFrame;

/// 示波器时域波形降采样点数（与前端 oscilloscope 模式对齐）。
pub const TIME_DOMAIN_SAMPLE_COUNT: usize = 512;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveformFrame {
    pub peak: f32,
    pub rms: f32,
    pub points: Vec<f32>,
    /// mono 时域样本，归一化到 [-1, 1]，长度通常为 `TIME_DOMAIN_SAMPLE_COUNT`。
    #[serde(default)]
    pub time_samples: Vec<f32>,
}

pub trait WaveformExtractor {
    fn extract(&self, frame: &AudioFrame) -> WaveformFrame;
}

#[derive(Debug, Clone)]
pub struct DefaultWaveformExtractor {
    bucket_size: usize,
    smoothing: f32,
}

impl DefaultWaveformExtractor {
    pub fn new(bucket_size: usize, smoothing: f32) -> Self {
        Self {
            bucket_size: bucket_size.max(8),
            smoothing: smoothing.clamp(0.0, 0.999),
        }
    }
}

impl WaveformExtractor for DefaultWaveformExtractor {
    fn extract(&self, frame: &AudioFrame) -> WaveformFrame {
        let mono = to_mono(&frame.samples, frame.channels as usize);
        let peak = mono.iter().fold(0.0_f32, |acc, v| acc.max(v.abs()));
        let rms = ((mono.iter().map(|v| v * v).sum::<f32>()) / mono.len() as f32).sqrt();
        let points = downsample_envelope(&mono, self.bucket_size, self.smoothing);
        let time_samples = downsample_time_domain(&mono, TIME_DOMAIN_SAMPLE_COUNT);
        WaveformFrame {
            peak,
            rms,
            points,
            time_samples,
        }
    }
}

/// 将 mono 缓冲均匀降采样为固定长度时域波形（用于示波器）。
pub fn downsample_time_domain(samples: &[f32], target_len: usize) -> Vec<f32> {
    if target_len == 0 {
        return Vec::new();
    }
    if samples.is_empty() {
        return vec![0.0; target_len];
    }
    let len = samples.len();
    (0..target_len)
        .map(|i| {
            let src_f = (i as f32 + 0.5) / target_len as f32 * len as f32;
            let idx = (src_f as usize).min(len - 1);
            samples[idx].clamp(-1.0, 1.0)
        })
        .collect()
}

pub struct WaveformHistory {
    frames: VecDeque<WaveformFrame>,
    capacity: usize,
}

impl WaveformHistory {
    pub fn new(capacity: usize) -> Self {
        Self {
            frames: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, frame: WaveformFrame) {
        if self.frames.len() == self.capacity {
            self.frames.pop_front();
        }
        self.frames.push_back(frame);
    }

    pub fn latest(&self) -> Option<&WaveformFrame> {
        self.frames.back()
    }

    pub fn len(&self) -> usize {
        self.frames.len()
    }
}

fn to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }

    samples
        .chunks(channels)
        .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
        .collect()
}

fn downsample_envelope(samples: &[f32], bucket_size: usize, smoothing: f32) -> Vec<f32> {
    let mut out = Vec::new();
    let mut prev = 0.0_f32;

    for bucket in samples.chunks(bucket_size) {
        let peak = bucket.iter().fold(0.0_f32, |acc, v| acc.max(v.abs()));
        let smoothed = prev * smoothing + peak * (1.0 - smoothing);
        out.push(smoothed);
        prev = smoothed;
    }
    out
}

#[cfg(test)]
mod tests {
    use approx::assert_relative_eq;

    use super::*;
    use crate::audio_capture::AudioFrame;

    #[test]
    fn should_extract_waveform_points() {
        let extractor = DefaultWaveformExtractor::new(4, 0.0);
        let frame = AudioFrame {
            sample_rate: 48_000,
            channels: 2,
            samples: vec![0.1, 0.2, -0.5, -0.3, 0.9, 0.8, 0.2, 0.1],
        };
        let wf = extractor.extract(&frame);

        assert_eq!(wf.points.len(), 1);
        assert_eq!(wf.time_samples.len(), TIME_DOMAIN_SAMPLE_COUNT);
        assert_relative_eq!(wf.peak, 0.85, epsilon = 0.0001);
        assert!(wf.rms > 0.0);
    }

    #[test]
    fn should_downsample_time_domain() {
        let samples: Vec<f32> = (0..256).map(|i| (i as f32 / 255.0) * 2.0 - 1.0).collect();
        let out = downsample_time_domain(&samples, 8);
        assert_eq!(out.len(), 8);
        assert!(out[0] >= -1.0 && out[0] <= 1.0);
        assert!(out[7] >= -1.0 && out[7] <= 1.0);
    }
}
