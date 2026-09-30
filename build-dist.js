const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

// Specific directories to include
const includeDirs = [
    'assets',
    'images-webp',
    'images-portrait-webp',
    'images-2-webp',
    'images-2-portrait-webp',
    'images-jpg',
    'images-2-jpg'
];

// Specific files to include from root
const includeFiles = [
    'index.html',
    'pricing.html',
    'dental-reforms.html',
    'dargar-communication.html',
    'siddhi-dental.html',
    'global-computer-solution.html',
    'style.css',
    'style.min.css',
    'script.js',
    'script.min.js',
    '_headers',
    '_redirects',
    'robots.txt',
    'sitemap.xml',
    'favicon.ico',
    'favicon.svg',
    'favicon.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
    'og-image.jpg',
    'og-image.png'
];

function copyFolderRecursive(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    const items = fs.readdirSync(source);
    for (const item of items) {
        const sPath = path.join(source, item);
        const dPath = path.join(target, item);
        const stat = fs.statSync(sPath);

        if (stat.isDirectory()) {
            copyFolderRecursive(sPath, dPath);
        } else {
            fs.copyFileSync(sPath, dPath);
        }
    }
}

console.log('📦 Preparing clean dist for Cloudflare Pages deployment...');

// Clean dist folder
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy root files
let fileCount = 0;
for (const file of includeFiles) {
    const sPath = path.join(rootDir, file);
    if (fs.existsSync(sPath)) {
        fs.copyFileSync(sPath, path.join(distDir, file));
        fileCount++;
    }
}

// Copy directories
for (const dir of includeDirs) {
    const sPath = path.join(rootDir, dir);
    if (fs.existsSync(sPath)) {
        copyFolderRecursive(sPath, path.join(distDir, dir));
    }
}

// Calculate total size and total files
function countDir(dir) {
    let count = 0;
    let size = 0;
    for (const item of fs.readdirSync(dir)) {
        const p = path.join(dir, item);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
            const res = countDir(p);
            count += res.count;
            size += res.size;
        } else {
            count++;
            size += stat.size;
        }
    }
    return { count, size };
}

const stats = countDir(distDir);
console.log(`✅ dist prepared successfully!`);
console.log(`📊 Total Files: ${stats.count} | Total Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
