use anyhow::Context;

use crate::audio_capture::AudioSource;
use crate::audio_processing::{WaveformExtractor, WaveformHistory};
use crate::platform::PlatformService;
use crate::visualization::RenderAdapter;

#[derive(Debug, Clone, Copy)]
pub struct AppConfig {
    pub frame_size: usize,
    pub max_visual_frames: usize,
}

pub struct WaveDanceApp<S, E, R, P>
where
    S: AudioSource,
    E: WaveformExtractor,
    R: RenderAdapter,
    P: PlatformService,
{
    source: S,
    extractor: E,
    renderer: R,
    platform: P,
    history: WaveformHistory,
    config: AppConfig,
}

impl<S, E, R, P> WaveDanceApp<S, E, R, P>
where
    S: AudioSource,
    E: WaveformExtractor,
    R: RenderAdapter,
    P: PlatformService,
{
    pub fn new(source: S, extractor: E, renderer: R, platform: P, config: AppConfig) -> Self {
        Self {
            source,
            extractor,
            renderer,
            platform,
            history: WaveformHistory::new(config.max_visual_frames),
            config,
        }
    }

    pub fn bootstrap(&mut self) -> anyhow::Result<()> {
        let status = self.platform.detect_audio_loopback_status();
        println!("平台检测：{}", status.hint);
        self.source.start().context("启动音频输入失败")?;
        Ok(())
    }

    pub fn run_for_frames(&mut self, frames: usize) -> anyhow::Result<()> {
        for _ in 0..frames {
            let audio = self
                .source
                .read_frame(self.config.frame_size)
                .context("读取音频帧失败")?;
            let wf = self.extractor.extract(&audio);
            self.history.push(wf);
            if let Some(last) = self.history.latest() {
                self.renderer.render(last);
            }
        }
        self.source.stop().context("停止音频输入失败")?;
        Ok(())
    }
}
