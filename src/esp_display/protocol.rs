//! WaveDance → ESP32 外接屏二进制帧（WDFR v1）。

use crate::audio_processing::WaveformFrame;

pub const MAGIC: u32 = 0x5744_4652; // "WDFR"
pub const VERSION: u8 = 1;
pub const HEADER_LEN: usize = 20;

pub const FLAG_SILENCE: u8 = 0x01;
pub const FLAG_HAS_TIME: u8 = 0x02;
pub const FLAG_FREQ_REVERSED: u8 = 0x04;

pub const MAX_POINT_COUNT: usize = 64;
pub const MAX_TIME_COUNT: usize = 256;

pub const DEFAULT_SILENCE_PEAK_GATE: f32 = 0.003;
pub const DEFAULT_SILENCE_RMS_GATE: f32 = 0.001;

#[derive(Debug, Clone)]
pub struct EncodeOptions {
    pub freq_reversed: bool,
    pub include_time_samples: bool,
    pub time_sample_count: usize,
    pub silence_peak_gate: f32,
    pub silence_rms_gate: f32,
}

impl Default for EncodeOptions {
    fn default() -> Self {
        Self {
            freq_reversed: false,
            include_time_samples: false,
            time_sample_count: 128,
            silence_peak_gate: DEFAULT_SILENCE_PEAK_GATE,
            silence_rms_gate: DEFAULT_SILENCE_RMS_GATE,
        }
    }
}

/// 将频谱桶合并为目标数量（与 Tauri 主链路 `rebucket_points` 一致）。
pub fn rebucket_points(points: &[f32], bucket_count: usize) -> Vec<f32> {
    if points.is_empty() {
        return Vec::new();
    }
    let target = bucket_count.clamp(8, MAX_POINT_COUNT);
    if points.len() <= target {
        return points.to_vec();
    }

    let mut out = Vec::with_capacity(target);
    for i in 0..target {
        let start = i * points.len() / target;
        let end = ((i + 1) * points.len() / target).max(start + 1);
        let slice = &points[start..end];
        let avg = slice.iter().sum::<f32>() / slice.len() as f32;
        out.push(avg);
    }
    out
}

fn downsample_slice(samples: &[f32], target_len: usize) -> Vec<f32> {
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

fn quantize_point(v: f32) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn quantize_time_sample(v: f32) -> i8 {
    (v.clamp(-1.0, 1.0) * 127.0).round() as i8
}

/// 编码一帧 WDFR；`points` 长度须 ≤ [`MAX_POINT_COUNT`].
pub fn encode_frame(
    seq: u16,
    peak: f32,
    rms: f32,
    points: &[f32],
    time_samples: &[f32],
    options: &EncodeOptions,
) -> Result<Vec<u8>, String> {
    let n = points.len();
    if n == 0 || n > MAX_POINT_COUNT {
        return Err(format!(
            "频谱桶数量须在 1~{} 之间，当前为 {}",
            MAX_POINT_COUNT,
            n
        ));
    }

    let silence = peak < options.silence_peak_gate && rms < options.silence_rms_gate;
    let mut flags = 0u8;
    if silence {
        flags |= FLAG_SILENCE;
    }

    let time_payload: Vec<f32> = if options.include_time_samples {
        let m = options.time_sample_count.clamp(64, MAX_TIME_COUNT);
        flags |= FLAG_HAS_TIME;
        downsample_slice(time_samples, m)
    } else {
        Vec::new()
    };

    if options.freq_reversed {
        flags |= FLAG_FREQ_REVERSED;
    }

    let m = time_payload.len();
    let total = HEADER_LEN + n + m;
    let mut out = Vec::with_capacity(total);

    out.extend_from_slice(&MAGIC.to_le_bytes());
    out.push(VERSION);
    out.push(flags);
    out.extend_from_slice(&seq.to_le_bytes());
    out.extend_from_slice(&(n as u16).to_le_bytes());
    out.extend_from_slice(&(m as u16).to_le_bytes());
    out.extend_from_slice(&peak.to_le_bytes());
    out.extend_from_slice(&rms.to_le_bytes());

    for p in points {
        out.push(quantize_point(*p));
    }
    for t in &time_payload {
        out.push(quantize_time_sample(*t) as u8);
    }

    Ok(out)
}

/// 从 [`WaveformFrame`] 编码；`bucket_count` 为 ESP 专用分桶数。
pub fn encode_waveform_frame(
    seq: u16,
    frame: &WaveformFrame,
    bucket_count: usize,
    options: &EncodeOptions,
) -> Result<Vec<u8>, String> {
    let points = rebucket_points(&frame.points, bucket_count);
    encode_frame(
        seq,
        frame.peak,
        frame.rms,
        &points,
        &frame.time_samples,
        options,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_default_size() {
        let points: Vec<f32> = (0..32).map(|i| i as f32 / 32.0).collect();
        let buf = encode_frame(1, 0.5, 0.3, &points, &[], &EncodeOptions::default()).unwrap();
        assert_eq!(buf.len(), HEADER_LEN + 32);
        assert_eq!(u32::from_le_bytes(buf[0..4].try_into().unwrap()), MAGIC);
        assert_eq!(buf[4], VERSION);
        assert_eq!(u16::from_le_bytes(buf[8..10].try_into().unwrap()), 32);
        assert_eq!(u16::from_le_bytes(buf[10..12].try_into().unwrap()), 0);
    }

    #[test]
    fn silence_flag() {
        let points = vec![0.0; 16];
        let mut opt = EncodeOptions::default();
        let buf = encode_frame(2, 0.001, 0.0005, &points, &[], &opt).unwrap();
        assert_eq!(buf[5] & FLAG_SILENCE, FLAG_SILENCE);

        opt.silence_peak_gate = 0.0001;
        let buf = encode_frame(3, 0.5, 0.3, &points, &[], &opt).unwrap();
        assert_eq!(buf[5] & FLAG_SILENCE, 0);
    }

    #[test]
    fn time_samples_payload() {
        let points = vec![0.5; 8];
        let time: Vec<f32> = (0..512).map(|i| (i as f32 / 512.0) * 2.0 - 1.0).collect();
        let opt = EncodeOptions {
            include_time_samples: true,
            time_sample_count: 128,
            ..EncodeOptions::default()
        };
        let buf = encode_frame(4, 0.5, 0.3, &points, &time, &opt).unwrap();
        assert_eq!(buf[5] & FLAG_HAS_TIME, FLAG_HAS_TIME);
        assert_eq!(u16::from_le_bytes(buf[10..12].try_into().unwrap()), 128);
        assert_eq!(buf.len(), HEADER_LEN + 8 + 128);
    }

    #[test]
    fn reject_too_many_buckets() {
        let points = vec![0.1; 65];
        let err = encode_frame(1, 0.5, 0.3, &points, &[], &EncodeOptions::default()).unwrap_err();
        assert!(err.contains("频谱桶"));
    }
}
