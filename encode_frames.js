/**
 * Frame Encoding & Resampling Pipeline
 *
 * Sequence 1 Landscape: 140 frames (1920x1080, WebP Q85 + JPEG Q90 4:4:4)
 * Sequence 2 Landscape: 150 frames (1920x1080, WebP Q85 + JPEG Q90 4:4:4)
 *
 * Sequence 1 Portrait:   90 frames (960x2080, WebP Q76)
 * Sequence 2 Portrait:   96 frames (960x2080, WebP Q76 with light denoise)
 *
 * Output Directories:
 * - images-portrait-webp/   (90 WebP frames)
 * - images-2-portrait-webp/ (96 WebP frames)
 * - images-webp/            (140 WebP frames)
 * - images-jpg/             (140 JPEG frames)
 * - images-2-webp/          (150 WebP frames)
 * - images-2-jpg/           (150 JPEG frames)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_DIR = __dirname;

const pyScript = `
import os
import glob
import shutil
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageFilter

BASE_DIR = r"${BASE_DIR.replace(/\\/g, '/')}"
os.chdir(BASE_DIR)

# Output directories
DIR_SEQ1_PORT_WEBP = os.path.join(BASE_DIR, "images-portrait-webp")
DIR_SEQ2_PORT_WEBP = os.path.join(BASE_DIR, "images-2-portrait-webp")

DIR_SEQ1_LAND_WEBP = os.path.join(BASE_DIR, "images-webp")
DIR_SEQ1_LAND_JPG  = os.path.join(BASE_DIR, "images-jpg")
DIR_SEQ2_LAND_WEBP = os.path.join(BASE_DIR, "images-2-webp")
DIR_SEQ2_LAND_JPG  = os.path.join(BASE_DIR, "images-2-jpg")

# Clean old portrait directories to prevent stale frame files
for d in [DIR_SEQ1_PORT_WEBP, DIR_SEQ2_PORT_WEBP]:
    if os.path.exists(d):
        shutil.rmtree(d)
    os.makedirs(d, exist_ok=True)

for d in [DIR_SEQ1_LAND_WEBP, DIR_SEQ1_LAND_JPG, DIR_SEQ2_LAND_WEBP, DIR_SEQ2_LAND_JPG]:
    os.makedirs(d, exist_ok=True)

# Delete obsolete JPEG portrait directories if present
DIR_SEQ1_PORT_JPG = os.path.join(BASE_DIR, "images-portrait-jpg")
DIR_SEQ2_PORT_JPG = os.path.join(BASE_DIR, "images-2-portrait-jpg")
for obsolete_dir in [DIR_SEQ1_PORT_JPG, DIR_SEQ2_PORT_JPG]:
    if os.path.exists(obsolete_dir):
        shutil.rmtree(obsolete_dir)

def aspect_preserving_crop(img, target_w, target_h, anchor_x=0.50, anchor_y=0.40):
    src_w, src_h = img.size
    # Cover scale: scale by max(target_w / src_w, target_h / src_h)
    scale = max(target_w / src_w, target_h / src_h)
    scaled_w = int(round(src_w * scale))
    scaled_h = int(round(src_h * scale))
    
    # Assert output aspect ratio matches input aspect ratio before cropping
    src_aspect = src_w / src_h
    scaled_aspect = scaled_w / scaled_h
    assert abs(scaled_aspect - src_aspect) < 0.005, f"Aspect ratio mismatch: scaled {scaled_aspect:.6f} vs source {src_aspect:.6f}"
    
    # High quality Lanczos scale
    img_scaled = img.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
    
    # Crop to exact target dimensions around tunable anchor
    left = int(round((scaled_w - target_w) * anchor_x))
    top  = int(round((scaled_h - target_h) * anchor_y))
    left = max(0, min(scaled_w - target_w, left))
    top  = max(0, min(scaled_h - target_h, top))
    
    img_cropped = img_scaled.crop((left, top, left + target_w, top + target_h))
    return img_cropped

def encode_portrait_task(args):
    src_path, out_num, out_webp_dir, denoise, anchor_x, anchor_y = args
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
            # Aspect-preserving scale + cover crop to exactly 960x2080
            img_res = aspect_preserving_crop(img, 960, 2080, anchor_x=anchor_x, anchor_y=anchor_y)
            
            if denoise:
                # Mild smoothing on noisy magenta/red gradient for Sequence 2
                img_res = img_res.filter(ImageFilter.SMOOTH_MORE)
            
            out_name = f"frame_{out_num:04d}"
            webp_path = os.path.join(out_webp_dir, f"{out_name}.webp")
            img_res.save(webp_path, "WEBP", quality=76, method=4)
        return True
    except Exception as e:
        print(f"Error on {src_path}: {e}", flush=True)
        return False

def encode_landscape_task(args):
    src_path, out_num, out_webp_dir, out_jpg_dir = args
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
            # If dimensions differ from 1920x1080, perform aspect-preserving crop
            if img.size != (1920, 1080):
                img = aspect_preserving_crop(img, 1920, 1080, anchor_x=0.50, anchor_y=0.50)
                
            out_name = f"frame_{out_num:04d}"
            webp_path = os.path.join(out_webp_dir, f"{out_name}.webp")
            jpg_path  = os.path.join(out_jpg_dir, f"{out_name}.jpg")
            
            # WebP Quality 85
            img.save(webp_path, "WEBP", quality=85, method=4)
            # JPEG Quality 90 with 4:4:4 chroma subsampling (subsampling=0)
            img.save(jpg_path, "JPEG", quality=90, subsampling=0)
        return True
    except Exception as e:
        print(f"Error on {src_path}: {e}", flush=True)
        return False

# 1. Build tasks for Sequence 1 Portrait (90 frames cropped from original 16:9 source frames in images/)
land1_dir = os.path.join(BASE_DIR, "images")
land1_files = sorted([os.path.join(land1_dir, f) for f in os.listdir(land1_dir) if f.startswith("ezgif-") and f.lower().endswith(('.jpg', '.jpeg', '.png'))]) if os.path.exists(land1_dir) else []

tasks_seq1_port = []
if land1_files:
    for i in range(90):
        out_num = i + 1
        src_i = round(i * (len(land1_files) - 1) / (90 - 1)) if len(land1_files) > 1 else 0
        src_p = land1_files[min(src_i, len(land1_files) - 1)]
        # Default anchor: 50% horizontal, 40% vertical
        tasks_seq1_port.append((src_p, out_num, DIR_SEQ1_PORT_WEBP, False, 0.50, 0.40))

# 2. Build tasks for Sequence 2 Portrait (96 frames cropped from original 16:9 source frames in images 2/)
land2_dir = os.path.join(BASE_DIR, "images 2")
land2_files = sorted([os.path.join(land2_dir, f) for f in os.listdir(land2_dir) if f.startswith("ezgif-") and f.lower().endswith(('.jpg', '.jpeg', '.png'))]) if os.path.exists(land2_dir) else []

tasks_seq2_port = []
if land2_files:
    for i in range(96):
        out_num = i + 1
        src_i = round(i * (len(land2_files) - 1) / (96 - 1)) if len(land2_files) > 1 else 0
        src_p = land2_files[min(src_i, len(land2_files) - 1)]
        # Default anchor: 50% horizontal, 40% vertical with mild denoise
        tasks_seq2_port.append((src_p, out_num, DIR_SEQ2_PORT_WEBP, True, 0.50, 0.40))

# 3. Build tasks for Sequence 1 Landscape (140 frames from images/)
tasks_seq1_land = []
if land1_files:
    for i in range(140):
        out_num = i + 1
        src_i = round(i * (len(land1_files) - 1) / (140 - 1))
        src_p = land1_files[min(src_i, len(land1_files) - 1)]
        tasks_seq1_land.append((src_p, out_num, DIR_SEQ1_LAND_WEBP, DIR_SEQ1_LAND_JPG))

# 4. Build tasks for Sequence 2 Landscape (150 frames from images 2/)
tasks_seq2_land = []
if land2_files:
    for i in range(150):
        out_num = i + 1
        src_i = round(i * (len(land2_files) - 1) / (150 - 1))
        src_p = land2_files[min(src_i, len(land2_files) - 1)]
        tasks_seq2_land.append((src_p, out_num, DIR_SEQ2_LAND_WEBP, DIR_SEQ2_LAND_JPG))

print(f"Total Portrait Tasks: {len(tasks_seq1_port) + len(tasks_seq2_port)}", flush=True)
print(f"Total Landscape Tasks: {len(tasks_seq1_land) + len(tasks_seq2_land)}", flush=True)

with ThreadPoolExecutor(max_workers=8) as executor:
    p_results = list(executor.map(encode_portrait_task, tasks_seq1_port + tasks_seq2_port))
    l_results = list(executor.map(encode_landscape_task, tasks_seq1_land + tasks_seq2_land))

print(f"Successfully encoded {sum(p_results)}/{len(p_results)} portrait frames and {sum(l_results)}/{len(l_results)} landscape frames.", flush=True)

def report_dir_stats(label, d_webp, d_jpg=None):
    w_files = [f for f in os.listdir(d_webp) if f.endswith('.webp')]
    w_bytes = sum(os.path.getsize(os.path.join(d_webp, f)) for f in w_files)
    w_avg = (w_bytes / len(w_files) / 1024) if w_files else 0
    
    print(f"\\n--- {label} ---")
    print(f"  WebP: {len(w_files)} frames | Total: {w_bytes/(1024*1024):.2f} MB | Avg: {w_avg:.2f} KB/frame")
    if d_jpg and os.path.exists(d_jpg):
        j_files = [f for f in os.listdir(d_jpg) if f.endswith('.jpg')]
        j_bytes = sum(os.path.getsize(os.path.join(d_jpg, f)) for f in j_files)
        j_avg = (j_bytes / len(j_files) / 1024) if j_files else 0
        print(f"  JPEG: {len(j_files)} frames | Total: {j_bytes/(1024*1024):.2f} MB | Avg: {j_avg:.2f} KB/frame")

print("\\n=======================================================")
print("ENCODING PIPELINE SUMMARY")
print("=======================================================")
report_dir_stats("Sequence 1 Portrait (images-portrait-webp/)", DIR_SEQ1_PORT_WEBP)
report_dir_stats("Sequence 2 Portrait (images-2-portrait-webp/)", DIR_SEQ2_PORT_WEBP)
report_dir_stats("Sequence 1 Landscape (images-webp/ / images-jpg/)", DIR_SEQ1_LAND_WEBP, DIR_SEQ1_LAND_JPG)
report_dir_stats("Sequence 2 Landscape (images-2-webp/ / images-2-jpg/)", DIR_SEQ2_LAND_WEBP, DIR_SEQ2_LAND_JPG)
print("=======================================================")
`;

console.log('Starting Frame Encoding & Resampling Pipeline...');
const result = spawnSync('python', ['-c', pyScript], { stdio: 'inherit', cwd: BASE_DIR });

if (result.error) {
    console.error('Encoding pipeline failed:', result.error);
    process.exit(1);
} else {
    console.log('Encoding pipeline completed successfully.');
}
