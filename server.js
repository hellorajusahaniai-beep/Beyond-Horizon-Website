const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
    let reqUrl = decodeURI(req.url.split('?')[0]);
    if (reqUrl === '/' || reqUrl === '') {
        reqUrl = '/index.html';
    }

    // Route mappings for clean URLs
    const routeAliases = {
        '/case-study/dental-reforms': '/dental-reforms.html',
        '/case-study/dargar-communication': '/dargar-communication.html',
        '/case-study/global-computer-solution': '/global-computer-solution.html',
        '/case-study/siddhi-dental-clinic': '/siddhi-dental.html',
        '/dental-reforms': '/dental-reforms.html',
        '/dargar-communication': '/dargar-communication.html',
        '/global-computer-solution': '/global-computer-solution.html',
        '/siddhi-dental': '/siddhi-dental.html',
        '/pricing': '/pricing.html',
        '/work': '/index.html',
        '/services': '/index.html',
        '/process': '/index.html',
        '/contact': '/index.html'
    };

    if (routeAliases[reqUrl]) {
        reqUrl = routeAliases[reqUrl];
    }

    let filePath = path.normalize(path.join(PUBLIC_DIR, reqUrl));

    // Security check: stay inside directory
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // Try filePath as-is, or append .html if no extension
    if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const isStaticAsset = ['.css', '.js', '.webp', '.jpg', '.jpeg', '.png', '.svg', '.ico'].includes(ext);
        const cacheControl = isStaticAsset
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': cacheControl
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

server.listen(PORT, () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    console.log(`\n  Local:   http://localhost:${PORT}`);
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`  Network: http://${net.address}:${PORT}`);
            }
        }
    }
    console.log('');
});
