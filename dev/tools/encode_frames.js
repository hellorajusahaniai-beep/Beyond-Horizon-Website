/**
 * Frame Encoding & Resampling Pipeline
 *
 * Sequence 1 Landscape: 140 frames (1920x1080, WebP Q85 + JPEG Q90 4:4:4)
 * Sequence 2 Landscape: 149 frames (1920x1080, WebP Q85 + JPEG Q90 4:4:4)
 *
 * Sequence 1 Portrait:   90 frames (3698x2080, WebP Q76 from native 1920x1080 video)
 * Sequence 2 Portrait:   96 frames (3698x2080, WebP Q76 with light denoise from native 1920x1080 video)
 *
 * Output Directories:
 * - images-portrait-webp/   (90 WebP frames)
 * - images-2-portrait-webp/ (96 WebP frames)
 * - images-webp/            (140 WebP frames)
 * - images-jpg/             (140 JPEG frames)
 * - images-2-webp/          (149 WebP frames)
 * - images-2-jpg/           (149 JPEG frames)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_DIR = __dirname;

const pyScript = `
import os
import glob
import time
import threading
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

ALL_OUTPUT_DIRS = [
    DIR_SEQ1_PORT_WEBP, DIR_SEQ2_PORT_WEBP,
    DIR_SEQ1_LAND_WEBP, DIR_SEQ1_LAND_JPG,
    DIR_SEQ2_LAND_WEBP, DIR_SEQ2_LAND_JPG
]

for d in ALL_OUTPUT_DIRS:
    os.makedirs(d, exist_ok=True)

def is_valid_image(file_path, expected_w=None, expected_h=None):
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        return False
    try:
        with Image.open(file_path) as img:
            img.verify()
        with Image.open(file_path) as img:
            img.load()
            if expected_w is not None and expected_h is not None:
                if img.size != (expected_w, expected_h):
                    return False
            return True
    except Exception:
        return False

# Clean only 0-byte or corrupted / undecodable / mismatching files
cleaned_count = 0
for d in ALL_OUTPUT_DIRS:
    for fname in os.listdir(d):
        fpath = os.path.join(d, fname)
        if fname.endswith('.tmp') or (fname.endswith(('.webp', '.jpg', '.jpeg', '.png')) and not is_valid_image(fpath)):
            try:
                os.remove(fpath)
                cleaned_count += 1
            except Exception as e:
                pass

if cleaned_count > 0:
    print(f"Cleaned {cleaned_count} corrupt or 0-byte temporary/partial files.", flush=True)

# Delete obsolete JPEG portrait directories if present
DIR_SEQ1_PORT_JPG = os.path.join(BASE_DIR, "images-portrait-jpg")
DIR_SEQ2_PORT_JPG = os.path.join(BASE_DIR, "images-2-portrait-jpg")
for obsolete_dir in [DIR_SEQ1_PORT_JPG, DIR_SEQ2_PORT_JPG]:
    if os.path.exists(obsolete_dir):
        import shutil
        shutil.rmtree(obsolete_dir)

# Atomic file saver helper (Windows safe)
def save_atomic_image(image_obj, target_path, fmt, **save_kwargs):
    tmp_path = target_path + ".tmp"
    if os.path.exists(tmp_path):
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    
    image_obj.save(tmp_path, fmt, **save_kwargs)
    
    # Verify the temporary file before replacing
    if not is_valid_image(tmp_path):
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"Written file failed verification: {tmp_path}")
    
    # On Windows, remove target if exists before replace
    if os.path.exists(target_path):
        for _ in range(5):
            try:
                os.remove(target_path)
                break
            except OSError:
                time.sleep(0.05)
    os.replace(tmp_path, target_path)

# Progress tracker
progress_lock = threading.Lock()
completed_frames = 0
total_tasks_count = 0

def record_progress(increment=1):
    global completed_frames, total_tasks_count
    with progress_lock:
        completed_frames += increment
        if completed_frames % 10 == 0 or completed_frames == total_tasks_count:
            pct = (completed_frames / total_tasks_count) * 100 if total_tasks_count else 100
            print(f"[Progress] Completed {completed_frames}/{total_tasks_count} tasks ({pct:.1f}%)", flush=True)

def encode_portrait_task(args):
    src_path, out_num, out_webp_dir, denoise, target_h = args
    out_name = f"frame_{out_num:04d}"
    webp_path = os.path.join(out_webp_dir, f"{out_name}.webp")
    
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
            src_w, src_h = img.size
            
            # Uniform scale: derive target_w from target_h to preserve source aspect ratio
            target_w = int(round(target_h * src_w / src_h))
            
            src_aspect = src_w / src_h
            out_aspect = target_w / target_h
            assert abs(out_aspect - src_aspect) <= 0.005, f"Aspect ratio mismatch: output {out_aspect:.6f} vs source {src_aspect:.6f}"
            
            # Skip if valid, matching exact expected dimensions
            if is_valid_image(webp_path, target_w, target_h):
                record_progress()
                return True
                
            img_res = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
            if denoise:
                # Mild smoothing on noisy magenta/red gradient for Sequence 2
                img_res = img_res.filter(ImageFilter.SMOOTH_MORE)
            
            save_atomic_image(img_res, webp_path, "WEBP", quality=76, method=4)
        record_progress()
        return True
    except Exception as e:
        print(f"Error on {src_path} -> {webp_path}: {e}", flush=True)
        record_progress()
        return False

def encode_landscape_task(args):
    src_path, out_num, out_webp_dir, out_jpg_dir, target_w = args
    out_name = f"frame_{out_num:04d}"
    webp_path = os.path.join(out_webp_dir, f"{out_name}.webp")
    jpg_path  = os.path.join(out_jpg_dir, f"{out_name}.jpg")
    
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
            src_w, src_h = img.size
            
            # Uniform scale: derive target_h from target_w to preserve source aspect ratio
            target_h = int(round(target_w * src_h / src_w))
            
            src_aspect = src_w / src_h
            out_aspect = target_w / target_h
            assert abs(out_aspect - src_aspect) <= 0.005, f"Aspect ratio mismatch: output {out_aspect:.6f} vs source {src_aspect:.6f}"
            
            webp_valid = is_valid_image(webp_path, target_w, target_h)
            jpg_valid  = is_valid_image(jpg_path, target_w, target_h)
            
            if webp_valid and jpg_valid:
                record_progress()
                return True
                
            if (target_w, target_h) != (src_w, src_h):
                img_res = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
            else:
                img_res = img
            
            if not webp_valid:
                # WebP Quality 85
                save_atomic_image(img_res, webp_path, "WEBP", quality=85, method=4)
            
            if not jpg_valid:
                # JPEG Quality 90 with 4:4:4 chroma subsampling (subsampling=0)
                save_atomic_image(img_res, jpg_path, "JPEG", quality=90, subsampling=0)
                
        record_progress()
        return True
    except Exception as e:
        print(f"Error on {src_path} -> {webp_path} / {jpg_path}: {e}", flush=True)
        record_progress()
        return False

# 1. Build tasks for Sequence 1 Portrait from images-portrait-native/ (90 frames, native 1920x1080)
port1_dir = os.path.join(BASE_DIR, "images-portrait-native")
port1_files = sorted([os.path.join(port1_dir, f) for f in os.listdir(port1_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]) if os.path.exists(port1_dir) else []

tasks_seq1_port = []
if port1_files:
    for i in range(90):
        out_num = i + 1
        src_p = port1_files[i] if i < len(port1_files) else port1_files[-1]
        tasks_seq1_port.append((src_p, out_num, DIR_SEQ1_PORT_WEBP, False, 2080))

# 2. Build tasks for Sequence 2 Portrait from images-2-portrait-native/ (96 frames, native 1920x1080)
port2_dir = os.path.join(BASE_DIR, "images-2-portrait-native")
port2_files = sorted([os.path.join(port2_dir, f) for f in os.listdir(port2_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]) if os.path.exists(port2_dir) else []

tasks_seq2_port = []
if port2_files:
    for i in range(96):
        out_num = i + 1
        src_p = port2_files[i] if i < len(port2_files) else port2_files[-1]
        tasks_seq2_port.append((src_p, out_num, DIR_SEQ2_PORT_WEBP, True, 2080))

# 3. Build tasks for Sequence 1 Landscape (140 frames from images/)
land1_dir = os.path.join(BASE_DIR, "images")
land1_files = sorted([os.path.join(land1_dir, f) for f in os.listdir(land1_dir) if f.startswith("ezgif-") and f.lower().endswith(('.jpg', '.jpeg', '.png'))]) if os.path.exists(land1_dir) else []
tasks_seq1_land = []
if land1_files:
    for i in range(140):
        out_num = i + 1
        src_i = round(i * (len(land1_files) - 1) / (140 - 1))
        src_p = land1_files[min(src_i, len(land1_files) - 1)]
        tasks_seq1_land.append((src_p, out_num, DIR_SEQ1_LAND_WEBP, DIR_SEQ1_LAND_JPG, 1920))

# 4. Build tasks for Sequence 2 Landscape (149 frames from images 2/)
land2_dir = os.path.join(BASE_DIR, "images 2")
land2_files = sorted([os.path.join(land2_dir, f) for f in os.listdir(land2_dir) if f.startswith("ezgif-") and f.lower().endswith(('.jpg', '.jpeg', '.png'))]) if os.path.exists(land2_dir) else []
tasks_seq2_land = []
if land2_files:
    for i in range(149):
        out_num = i + 1
        src_i = round(i * (len(land2_files) - 1) / (149 - 1))
        src_p = land2_files[min(src_i, len(land2_files) - 1)]
        tasks_seq2_land.append((src_p, out_num, DIR_SEQ2_LAND_WEBP, DIR_SEQ2_LAND_JPG, 1920))

all_port_tasks = tasks_seq1_port + tasks_seq2_port
all_land_tasks = tasks_seq1_land + tasks_seq2_land
total_tasks_count = len(all_port_tasks) + len(all_land_tasks)

print(f"Total Portrait Tasks: {len(all_port_tasks)}", flush=True)
print(f"Total Landscape Tasks: {len(all_land_tasks)}", flush=True)
print(f"Total Tasks to Process: {total_tasks_count}", flush=True)

workers = min(os.cpu_count() or 4, 8)
print(f"Encoding using ThreadPoolExecutor with {workers} worker threads...", flush=True)

with ThreadPoolExecutor(max_workers=workers) as executor:
    p_futures = [executor.submit(encode_portrait_task, t) for t in all_port_tasks]
    l_futures = [executor.submit(encode_landscape_task, t) for t in all_land_tasks]
    p_results = [f.result() for f in p_futures]
    l_results = [f.result() for f in l_futures]

print(f"\\nSuccessfully encoded {sum(p_results)}/{len(p_results)} portrait frames and {sum(l_results)}/{len(l_results)} landscape frames.", flush=True)

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

console.log('Starting Crash-Safe Frame Encoding & Resampling Pipeline...');
const result = spawnSync('python', ['-c', pyScript], { stdio: 'inherit', cwd: BASE_DIR });

if (result.error) {
    console.error('Encoding pipeline failed:', result.error);
    process.exit(1);
} else {
    console.log('Encoding pipeline completed successfully.');
}
