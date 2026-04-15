use crate::audio_processing::WaveformFrame;

pub trait RenderAdapter {
    fn render(&mut self, frame: &WaveformFrame);
}

pub struct ConsoleWaveformRenderer {
    width: usize,
}

impl ConsoleWaveformRenderer {
    pub fn new(width: usize) -> Self {
        Self { width: width.max(16) }
    }
}

impl RenderAdapter for ConsoleWaveformRenderer {
    fn render(&mut self, frame: &WaveformFrame) {
        if frame.points.is_empty() {
            return;
        }
        let mut line = String::with_capacity(self.width);
        for i in 0..self.width {
            let idx = i * frame.points.len() / self.width;
            let amp = frame.points[idx.min(frame.points.len() - 1)];
            let c = match amp {
                x if x < 0.05 => ' ',
                x if x < 0.12 => '.',
                x if x < 0.25 => '-',
                x if x < 0.45 => '*',
                _ => '#',
            };
            line.push(c);
        }
        println!("|{}| peak={:.3} rms={:.3}", line, frame.peak, frame.rms);
    }
}
