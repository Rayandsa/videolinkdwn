const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const next = require('next');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const dev = process.env.NODE_ENV !== 'production';
console.log(`[SERVER] Mode: ${dev ? 'development' : 'production'}`);
const nextApp = next({ dev, dir: process.cwd() });
const handle = nextApp.getRequestHandler();

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DOWNLOADER_PY = dev
    ? path.join(__dirname, '..', 'downloader.py')
    : '/app/downloader.py';

const DOWNLOADS_DIR = dev
    ? path.join(__dirname, 'downloads')
    : '/app/dist/downloads';

app.use(cors());
app.use(express.json());

// === HELPERS ===

const detectPlatform = (url: string): 'youtube' | 'instagram' | 'tiktok' | 'unknown' => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
};

const cleanup = (file: string) => {
    setTimeout(() => {
        if (file && fs.existsSync(file)) {
            fs.unlink(file, () => console.log(`[CLEANUP] ${path.basename(file)}`));
        }
    }, 10000);
};

// === YOUTUBE via pytubefix ===

const runPytubefix = (args: string[]): Promise<any> => {
    return new Promise((resolve, reject) => {
        console.log(`[PYTUBEFIX] python3 ${DOWNLOADER_PY} ${args.join(' ')}`);

        const python = spawn('python3', [DOWNLOADER_PY, ...args]);
        let output = '';
        let errors = '';

        python.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            output += text;
            text.split('\n').forEach((line: string) => {
                if (line.trim() && !line.startsWith('{')) console.log(line);
            });
        });

        python.stderr.on('data', (data: Buffer) => {
            errors += data.toString();
        });

        python.on('close', (code: number) => {
            // Trouver le JSON dans la sortie
            const lines = output.trim().split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const result = JSON.parse(lines[i]);
                    resolve(result);
                    return;
                } catch (e) { continue; }
            }

            if (code !== 0) {
                reject(new Error(errors || `Exit code ${code}`));
            } else {
                reject(new Error('No JSON output'));
            }
        });

        python.on('error', reject);
    });
};

// === INSTAGRAM/TIKTOK via yt-dlp ===

const runYtDlp = async (url: string, outputPath: string, format: string): Promise<any> => {
    let cmd: string;

    if (format === 'mp3') {
        cmd = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputPath}" "${url}"`;
    } else {
        cmd = `yt-dlp -f "bestvideo+bestaudio/best" --merge-output-format mp4 -o "${outputPath}" "${url}"`;
    }

    console.log(`[YT-DLP] ${cmd}`);

    try {
        await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024, timeout: 300000 });
        return { success: true, path: outputPath };
    } catch (error: any) {
        throw new Error(error.stderr || error.message);
    }
};

// === API ROUTES ===

// Info endpoint
app.post('/api/info', async (req: any, res: any) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const platform = detectPlatform(url);
    console.log(`[INFO] Platform: ${platform}, URL: ${url}`);

    try {
        let metadata: any;

        if (platform === 'youtube') {
            // YouTube → pytubefix
            const result = await runPytubefix(['info', '--url', url]);
            if (!result.success) throw new Error(result.error);

            metadata = {
                title: result.title,
                thumbnail: result.thumbnail,
                duration: result.length ? `${Math.floor(result.length / 60)}:${(result.length % 60).toString().padStart(2, '0')}` : 'Unknown',
                platform: 'youtube',
                author: result.author,
                originalUrl: url
            };
        } else {
            // Instagram/TikTok → yt-dlp
            const cmd = `yt-dlp --dump-json "${url}"`;
            const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
            const data = JSON.parse(stdout);

            metadata = {
                title: data.title || data.description?.substring(0, 50) || 'Video',
                thumbnail: data.thumbnail,
                duration: data.duration_string || 'Unknown',
                platform,
                originalUrl: url
            };
        }

        console.log(`[INFO] Success: "${metadata.title}"`);
        res.json(metadata);

    } catch (error: any) {
        console.error(`[ERROR] ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch info', details: error.message });
    }
});

// Qualities endpoint (YouTube only)
app.post('/api/qualities', async (req: any, res: any) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const platform = detectPlatform(url);
    if (platform !== 'youtube') {
        return res.json({ qualities: [{ resolution: 'best', label: 'Best Quality' }] });
    }

    try {
        const result = await runPytubefix(['qualities', '--url', url]);
        if (!result.success) throw new Error(result.error);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Download endpoint
app.post('/api/download', async (req: any, res: any) => {
    const { url, format = 'mp4', quality = 'highest', title = 'video' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const platform = detectPlatform(url);
    console.log(`[DOWNLOAD] Platform: ${platform}, Format: ${format}, Quality: ${quality}`);

    // Prepare output
    if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    const timestamp = Date.now();
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const filename = `${safeTitle}_${timestamp}.${ext}`;
    const outputPath = path.join(DOWNLOADS_DIR, filename);

    try {
        let result: any;

        if (platform === 'youtube') {
            // === YOUTUBE → pytubefix ===
            result = await runPytubefix([
                'download',
                '--url', url,
                '--output', DOWNLOADS_DIR,
                '--filename', `${safeTitle}_${timestamp}`,
                '--format', format,
                '--quality', quality
            ]);
        } else {
            // === INSTAGRAM/TIKTOK → yt-dlp ===
            result = await runYtDlp(url, outputPath, format);
        }

        if (!result.success) throw new Error(result.error);

        const finalPath = result.path;
        if (!fs.existsSync(finalPath)) throw new Error('File not found after download');

        const stats = fs.statSync(finalPath);
        console.log(`[DOWNLOAD] Success! Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // Stream to client
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);

        const stream = fs.createReadStream(finalPath);
        stream.pipe(res);
        stream.on('end', () => cleanup(finalPath));

    } catch (error: any) {
        console.error(`[ERROR] ${error.message}`);
        res.status(500).json({ error: 'Download failed', details: error.message, platform });
    }
});

// Status endpoint
app.get('/api/status', (req: any, res: any) => {
    res.json({
        status: 'ok',
        engines: {
            youtube: 'pytubefix',
            instagram: 'yt-dlp',
            tiktok: 'yt-dlp'
        }
    });
});

// === NEXT.JS ===
nextApp.prepare().then(() => {
    app.all(/(.*)/, (req: any, res: any) => handle(req, res));

    app.listen(PORT, () => {
        console.log('');
        console.log('═'.repeat(50));
        console.log('  VIDEO LINK DOWNLOADER');
        console.log('═'.repeat(50));
        console.log(`  URL: http://localhost:${PORT}`);
        console.log('');
        console.log('  Engines:');
        console.log('  ├─ YouTube    → pytubefix');
        console.log('  ├─ Instagram  → yt-dlp');
        console.log('  └─ TikTok     → yt-dlp');
        console.log('');
        console.log(`  Downloads: ${DOWNLOADS_DIR}`);
        console.log('═'.repeat(50));
    });
});
