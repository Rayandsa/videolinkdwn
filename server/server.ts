const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const next = require('next');
const { spawn } = require('child_process');

const dev = process.env.NODE_ENV !== 'production';
console.log(`[SERVER] Starting in ${dev ? 'development' : 'production'} mode`);
const nextApp = next({ dev, dir: process.cwd() });
const handle = nextApp.getRequestHandler();

const app = express();
const PORT = process.env.PORT || 3000;

// Python script path - downloader.py at project root
const DOWNLOADER_SCRIPT = process.env.NODE_ENV === 'production'
    ? '/app/downloader.py'
    : path.join(__dirname, '..', 'downloader.py');

app.use(cors());
app.use(express.json());

// Execute Python downloader.py
const runPython = (args: string[]): Promise<any> => {
    return new Promise((resolve, reject) => {
        console.log(`[PYTHON] python3 ${DOWNLOADER_SCRIPT} ${args.join(' ')}`);

        const python = spawn('python3', [DOWNLOADER_SCRIPT, ...args], {
            env: process.env
        });
        let output = '';
        let errors = '';

        python.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            output += text;
            // Log progress lines
            text.split('\n').forEach((line: string) => {
                if (line.trim() && !line.startsWith('{')) {
                    console.log(line);
                }
            });
        });

        python.stderr.on('data', (data: Buffer) => {
            errors += data.toString();
        });

        python.on('close', (code: number) => {
            if (code !== 0 && !output.includes('"success"')) {
                console.error('[PYTHON ERROR]', errors);
                reject(new Error(errors || `Exit code ${code}`));
                return;
            }

            // Find JSON in output (last line with JSON)
            const lines = output.trim().split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const result = JSON.parse(lines[i]);
                    resolve(result);
                    return;
                } catch (e) {
                    continue;
                }
            }

            reject(new Error('No valid JSON in Python output'));
        });

        python.on('error', reject);
    });
};

// Cleanup helper
const cleanup = (filePath: string) => {
    setTimeout(() => {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {
                console.log(`[CLEANUP] Deleted: ${path.basename(filePath)}`);
            });
        }
    }, 5000);
};

// --- API ROUTES ---

// Get video info
app.post('/api/info', async (req: any, res: any) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[INFO] Fetching: ${url}`);

    try {
        const result = await runPython(['info', url]);

        if (!result.success) {
            throw new Error(result.error);
        }

        const metadata = {
            title: result.title,
            thumbnail: result.thumbnail,
            duration: result.length
                ? `${Math.floor(result.length / 60)}:${(result.length % 60).toString().padStart(2, '0')}`
                : 'Unknown',
            platform: 'youtube',
            originalUrl: url,
            author: result.author,
            views: result.views
        };

        console.log(`[INFO] Success: "${metadata.title}"`);
        res.json(metadata);

    } catch (error: any) {
        console.error('[ERROR]', error.message);
        res.status(500).json({
            error: 'Failed to fetch video info',
            details: error.message,
            suggestion: 'OAuth token may have expired. Re-authenticate on the server.'
        });
    }
});

// Download video
app.post('/api/download', async (req: any, res: any) => {
    const { url, format, title } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    console.log(`[DOWNLOAD] URL: ${url}, Format: ${format}`);

    // Downloads directory
    const downloadsDir = process.env.NODE_ENV === 'production'
        ? '/app/dist/downloads'
        : path.join(__dirname, 'downloads');

    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    const timestamp = Date.now();
    const filenameBase = `${safeTitle}_${timestamp}`;
    const extension = format === 'mp3' ? 'mp3' : 'mp4';
    const expectedPath = path.join(downloadsDir, `${filenameBase}.${extension}`);

    console.log(`[DOWNLOAD] Output: ${filenameBase}.${extension}`);

    try {
        // Call Python downloader
        const result = await runPython([
            'download',
            url,
            downloadsDir,
            filenameBase,
            extension
        ]);

        if (!result.success) {
            throw new Error(result.error);
        }

        const finalPath = result.path;

        if (!fs.existsSync(finalPath)) {
            throw new Error(`File not found: ${finalPath}`);
        }

        const stats = fs.statSync(finalPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`[DOWNLOAD] Success! Size: ${sizeMB} MB, Quality: ${result.quality || 'N/A'}`);

        // Stream file to client
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.${extension}"`);
        res.setHeader('Content-Length', stats.size);

        const stream = fs.createReadStream(finalPath);
        stream.pipe(res);
        stream.on('end', () => cleanup(finalPath));
        stream.on('error', (err: any) => {
            console.error('[STREAM ERROR]', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' });
            }
        });

    } catch (error: any) {
        console.error('[DOWNLOAD ERROR]', error.message);
        res.status(500).json({
            error: 'Download failed',
            details: error.message,
            suggestion: 'OAuth token may have expired. Re-authenticate on the server.'
        });
    }
});

// Auth status
app.get('/api/auth-status', (req: any, res: any) => {
    res.json({
        method: 'OAuth',
        engine: 'pytubefix'
    });
});

// --- NEXT.JS ---
nextApp.prepare().then(() => {
    app.all(/(.*)/, (req: any, res: any) => handle(req, res));

    app.listen(PORT, (err?: any) => {
        if (err) throw err;
        console.log('');
        console.log('═'.repeat(50));
        console.log('  VIDEO LINK DOWNLOADER');
        console.log('  Engine: pytubefix with OAuth');
        console.log('═'.repeat(50));
        console.log(`  URL: http://localhost:${PORT}`);
        console.log('');
        console.log(`  Downloader: ${DOWNLOADER_SCRIPT}`);
        console.log(`  Script exists: ${fs.existsSync(DOWNLOADER_SCRIPT) ? '✓' : '✗'}`);
        console.log('═'.repeat(50));
    });
});
