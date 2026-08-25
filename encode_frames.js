/**
 * Frame Encoding & Resampling Pipeline
 *
 * Sequence 1: 140 frames
 * Sequence 2: 150 frames
 *
 * Encodings:
 * - WebP: Quality 85
 * - JPEG: Quality 90 with 4:4:4 chroma subsampling (no color compression)
 *
 * Output Directories:
 * - images-portrait-webp/
 * - images-portrait-jpg/
 * - images-2-portrait-webp/
 * - images-2-portrait-jpg/
 * - images-webp/
 * - images-jpg/
 * - images-2-webp/
 * - images-2-jpg/
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_DIR = __dirname;

const pyScript = `
import os
import glob
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

BASE_DIR = r"${BASE_DIR.replace(/\\/g, '/')}"
os.chdir(BASE_DIR)

# Output directories
DIR_SEQ1_PORT_WEBP = os.path.join(BASE_DIR, "images-portrait-webp")
DIR_SEQ1_PORT_JPG  = os.path.join(BASE_DIR, "images-portrait-jpg")
DIR_SEQ2_PORT_WEBP = os.path.join(BASE_DIR, "images-2-portrait-webp")
DIR_SEQ2_PORT_JPG  = os.path.join(BASE_DIR, "images-2-portrait-jpg")

DIR_SEQ1_LAND_WEBP = os.path.join(BASE_DIR, "images-webp")
DIR_SEQ1_LAND_JPG  = os.path.join(BASE_DIR, "images-jpg")
DIR_SEQ2_LAND_WEBP = os.path.join(BASE_DIR, "images-2-webp")
DIR_SEQ2_LAND_JPG  = os.path.join(BASE_DIR, "images-2-jpg")

for d in [DIR_SEQ1_PORT_WEBP, DIR_SEQ1_PORT_JPG, DIR_SEQ2_PORT_WEBP, DIR_SEQ2_PORT_JPG,
          DIR_SEQ1_LAND_WEBP, DIR_SEQ1_LAND_JPG, DIR_SEQ2_LAND_WEBP, DIR_SEQ2_LAND_JPG]:
    os.makedirs(d, exist_ok=True)

def encode_task(args):
    src_path, out_num, out_webp_dir, out_jpg_dir = args
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
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

# 1. Build tasks for Sequence 1 Portrait (140 frames from images-portrait/)
port1_dir = os.path.join(BASE_DIR, "images-portrait")
port1_files = sorted([os.path.join(port1_dir, f) for f in os.listdir(port1_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]) if os.path.exists(port1_dir) else []

tasks_seq1_port = []
if port1_files:
    for i in range(140):
        out_num = i + 1
        src_i = round(i * (len(port1_files) - 1) / (140 - 1)) if len(port1_files) > 1 else 0
        src_p = port1_files[min(src_i, len(port1_files) - 1)]
        tasks_seq1_port.append((src_p, out_num, DIR_SEQ1_PORT_WEBP, DIR_SEQ1_PORT_JPG))

# 2. Build tasks for Sequence 2 Portrait (150 frames from images-2-portrait/)
port2_dir = os.path.join(BASE_DIR, "images-2-portrait")
port2_files = sorted([os.path.join(port2_dir, f) for f in os.listdir(port2_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]) if os.path.exists(port2_dir) else []

tasks_seq2_port = []
if port2_files:
    for i in range(150):
        out_num = i + 1
        src_i = round(i * (len(port2_files) - 1) / (150 - 1)) if len(port2_files) > 1 else 0
        src_p = port2_files[min(src_i, len(port2_files) - 1)]
        tasks_seq2_port.append((src_p, out_num, DIR_SEQ2_PORT_WEBP, DIR_SEQ2_PORT_JPG))

# 3. Build tasks for Sequence 1 Landscape (resample 270 frames from images/ down to 140)
land1_dir = os.path.join(BASE_DIR, "images")
land1_files = sorted([os.path.join(land1_dir, f) for f in os.listdir(land1_dir) if f.startswith("ezgif-") and f.lower().endswith(('.jpg', '.jpeg', '.png'))]) if os.path.exists(land1_dir) else []
tasks_seq1_land = []
if land1_files:
    for i in range(140):
        out_num = i + 1
        src_i = round(i * (len(land1_files) - 1) / (140 - 1))
        src_p = land1_files[min(src_i, len(land1_files) - 1)]
        tasks_seq1_land.append((src_p, out_num, DIR_SEQ1_LAND_WEBP, DIR_SEQ1_LAND_JPG))

# 4. Build tasks for Sequence 2 Landscape (resample 299 frames from images 2/ down to 150)
land2_dir = os.path.join(BASE_DIR, "images 2")
land2_files = sorted([os.path.join(land2_dir, f) for f in os.listdir(land2_dir) if f.startswith("ezgif-") and f.lower().endswith(('.jpg', '.jpeg', '.png'))]) if os.path.exists(land2_dir) else []
tasks_seq2_land = []
if land2_files:
    for i in range(150):
        out_num = i + 1
        src_i = round(i * (len(land2_files) - 1) / (150 - 1))
        src_p = land2_files[min(src_i, len(land2_files) - 1)]
        tasks_seq2_land.append((src_p, out_num, DIR_SEQ2_LAND_WEBP, DIR_SEQ2_LAND_JPG))

all_tasks = tasks_seq1_port + tasks_seq2_port + tasks_seq1_land + tasks_seq2_land
print(f"Total frame conversion tasks: {len(all_tasks)}", flush=True)

with ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(encode_task, all_tasks))

print(f"Successfully encoded {sum(results)}/{len(all_tasks)} frames.", flush=True)

def report_dir_stats(label, d_webp, d_jpg):
    w_files = [f for f in os.listdir(d_webp) if f.endswith('.webp')]
    j_files = [f for f in os.listdir(d_jpg) if f.endswith('.jpg')]
    w_bytes = sum(os.path.getsize(os.path.join(d_webp, f)) for f in w_files)
    j_bytes = sum(os.path.getsize(os.path.join(d_jpg, f)) for f in j_files)
    w_avg = (w_bytes / len(w_files) / 1024) if w_files else 0
    j_avg = (j_bytes / len(j_files) / 1024) if j_files else 0
    
    print(f"\\n--- {label} ---")
    print(f"  WebP (Q85):        {len(w_files)} frames | Total: {w_bytes/(1024*1024):.2f} MB | Avg: {w_avg:.2f} KB/frame")
    print(f"  JPEG (Q90, 4:4:4): {len(j_files)} frames | Total: {j_bytes/(1024*1024):.2f} MB | Avg: {j_avg:.2f} KB/frame")

print("\\n=======================================================")
print("ENCODING PIPELINE SUMMARY")
print("=======================================================")
report_dir_stats("Sequence 1 Portrait (images-portrait-webp/ / images-portrait-jpg/)", DIR_SEQ1_PORT_WEBP, DIR_SEQ1_PORT_JPG)
report_dir_stats("Sequence 2 Portrait (images-2-portrait-webp/ / images-2-portrait-jpg/)", DIR_SEQ2_PORT_WEBP, DIR_SEQ2_PORT_JPG)
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
