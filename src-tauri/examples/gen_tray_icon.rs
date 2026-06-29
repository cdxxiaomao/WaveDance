//! 一次性生成菜单栏托盘专用图标（仅图形、透明底）。
//! 运行：`cargo run --example gen_tray_icon`

use image::{GenericImageView, Rgba, RgbaImage};
use std::path::PathBuf;

fn make_transparent_icon(src: &RgbaImage) -> RgbaImage {
    let (w, h) = src.dimensions();
    let mut out = RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let p = src.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            if a == 0 {
                out.put_pixel(x, y, Rgba([0, 0, 0, 0]));
                continue;
            }
            let max_c = r.max(g).max(b);
            let min_c = r.min(g).min(b);
            let lum = (0.299 * f32::from(r) + 0.587 * f32::from(g) + 0.114 * f32::from(b)) as u8;
            // 去掉深紫/近黑背景，保留彩色图形与光晕。
            let is_bg = lum < 36 && max_c.saturating_sub(min_c) < 28;
            if is_bg {
                out.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            } else {
                out.put_pixel(x, y, *p);
            }
        }
    }
    out
}

fn resize_lanczos3(src: &RgbaImage, size: u32) -> RgbaImage {
    image::imageops::resize(src, size, size, image::imageops::FilterType::Lanczos3)
}

fn main() {
    let icons_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons");
    let src_path = icons_dir.join("icon.png");
    let img = image::open(&src_path).expect("open icon.png");
    let (w, h) = img.dimensions();
    let crop_h = ((h as f32) * 0.58).round() as u32;
    let cropped = img.crop_imm(0, 0, w, crop_h).to_rgba8();
    let cleaned = make_transparent_icon(&cropped);

    let tray_1x = resize_lanczos3(&cleaned, 22);
    let tray_2x = resize_lanczos3(&cleaned, 44);

    tray_1x
        .save(icons_dir.join("tray-icon.png"))
        .expect("write tray-icon.png");
    tray_2x
        .save(icons_dir.join("tray-icon@2x.png"))
        .expect("write tray-icon@2x.png");

    println!("Generated {} and {}", icons_dir.join("tray-icon.png").display(), icons_dir.join("tray-icon@2x.png").display());
}
