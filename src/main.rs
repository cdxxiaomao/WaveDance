use wavedance::application::{AppConfig, WaveDanceApp};
use wavedance::audio_capture::{MacSystemAudioSource, MockAudioSource};
use wavedance::audio_processing::DefaultWaveformExtractor;
use wavedance::platform::MacPlatformService;
use wavedance::visualization::ConsoleWaveformRenderer;

fn main() -> anyhow::Result<()> {
    let source = MacSystemAudioSource::new(Some("BlackHole".to_string()));
    let extractor = DefaultWaveformExtractor::new(512, 0.95);
    let renderer = ConsoleWaveformRenderer::new(80);
    let platform = MacPlatformService::default();

    let config = AppConfig {
        frame_size: 1024,
        max_visual_frames: 128,
    };

    let mut app = WaveDanceApp::new(source, extractor, renderer, platform, config);
    if let Err(err) = app.bootstrap().and_then(|_| app.run_for_frames(24)) {
        eprintln!("真实音频采集启动失败，已回退模拟音频: {err}");
        let source = MockAudioSource::new(48_000, 2, 440.0, 0.30);
        let extractor = DefaultWaveformExtractor::new(512, 0.95);
        let renderer = ConsoleWaveformRenderer::new(80);
        let platform = MacPlatformService::default();
        let mut fallback_app = WaveDanceApp::new(source, extractor, renderer, platform, config);
        fallback_app.bootstrap()?;
        fallback_app.run_for_frames(24)?;
    }
    Ok(())
}
