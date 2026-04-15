use std::process::Command;

#[derive(Debug, Clone)]
pub struct DeviceStatus {
    pub blackhole_installed: bool,
    pub hint: String,
}

pub trait PlatformService {
    fn detect_audio_loopback_status(&self) -> DeviceStatus;
}

#[derive(Default)]
pub struct MacPlatformService;

impl PlatformService for MacPlatformService {
    fn detect_audio_loopback_status(&self) -> DeviceStatus {
        let output = Command::new("sh")
            .arg("-c")
            .arg("system_profiler SPAudioDataType 2>/dev/null")
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
                let installed = text.contains("blackhole");
                let hint = if installed {
                    "已检测到 BlackHole，可直接选择对应输出设备。".to_string()
                } else {
                    "未检测到 BlackHole，请先安装后再继续系统音频回采。".to_string()
                };
                DeviceStatus {
                    blackhole_installed: installed,
                    hint,
                }
            }
            _ => DeviceStatus {
                blackhole_installed: false,
                hint: "无法自动检测音频设备，请手动确认 BlackHole 安装状态。".to_string(),
            },
        }
    }
}
