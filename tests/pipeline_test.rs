use wavedance::application::{AppConfig, WaveDanceApp};
use wavedance::audio_capture::{AudioFrame, AudioSource, AudioSourceError};
use wavedance::audio_processing::{WaveformExtractor, WaveformFrame};
use wavedance::platform::{DeviceStatus, PlatformService};
use wavedance::visualization::RenderAdapter;

struct StubSource;

impl AudioSource for StubSource {
    fn start(&mut self) -> Result<(), AudioSourceError> {
        Ok(())
    }
    fn read_frame(&mut self, frame_size: usize) -> Result<AudioFrame, AudioSourceError> {
        Ok(AudioFrame {
            sample_rate: 48_000,
            channels: 1,
            samples: vec![0.2; frame_size],
        })
    }
    fn stop(&mut self) -> Result<(), AudioSourceError> {
        Ok(())
    }
}

struct StubExtractor;
impl WaveformExtractor for StubExtractor {
    fn extract(&self, _frame: &AudioFrame) -> WaveformFrame {
        WaveformFrame {
            peak: 0.2,
            rms: 0.2,
            points: vec![0.2, 0.2],
            time_samples: vec![0.2; 8],
        }
    }
}

struct StubRenderer {
    rendered: usize,
}
impl RenderAdapter for StubRenderer {
    fn render(&mut self, _frame: &WaveformFrame) {
        self.rendered += 1;
    }
}

struct StubPlatform;
impl PlatformService for StubPlatform {
    fn detect_audio_loopback_status(&self) -> DeviceStatus {
        DeviceStatus {
            blackhole_installed: true,
            hint: "ok".to_string(),
        }
    }
}

#[test]
fn should_run_pipeline() {
    let source = StubSource;
    let extractor = StubExtractor;
    let renderer = StubRenderer { rendered: 0 };
    let platform = StubPlatform;
    let config = AppConfig {
        frame_size: 16,
        max_visual_frames: 8,
    };

    let mut app = WaveDanceApp::new(source, extractor, renderer, platform, config);
    app.bootstrap().unwrap();
    app.run_for_frames(3).unwrap();
}
