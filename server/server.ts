const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const next = require('next');
const ytDlpExec = require('yt-dlp-exec');
// Use system yt-dlp binary (installed via pip, always up-to-date)
const YTDlpWrap = ytDlpExec.create('yt-dlp');

const dev = process.env.NODE_ENV !== 'production';
console.log(`[SERVER] Starting in ${dev ? 'development' : 'production'} mode`);
const nextApp = next({ dev, dir: process.cwd() }); // Explicitly set dir to current working directory
const handle = nextApp.getRequestHandler();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup generic yt-dlp path (on Render/Linux it needs to be in PATH or handled by wrapper)
// ideally we use the wrapper, but for raw exec we need a path.
// Better strategy for Render: Use a download helper or ensure binary is present.
// For now, let's use a simpler approach: assume 'yt-dlp' is in PATH on production (Render with Docker)
// OR failback to a local bin.
const YT_DLP_BINARY = process.platform === 'win32'
    ? 'yt-dlp.exe' // Expect it in root or PATH on Windows dev
    : 'yt-dlp';    // Expect it in PATH on Linux

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

app.use(cors());
app.use(express.json());

// Helper cleanup
const cleanup = (filePath: any) => {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err: any) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        }
    }, 5000);
};

// --- API ROUTES ---

app.post('/api/info', async (req: any, res: any) => {
    const { url, platform } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[INFO] Fetching metadata for: ${url}`);

    try {
        // Use yt-dlp-exec wrapper which handles binaries better cross-platform
        // Note: YTDlpWrap.exec returns a promise
        const output = await YTDlpWrap(url, {
            dumpJson: true,
            noWarnings: true,
            noCheckCertificates: true,
            userAgent: USER_AGENT,
            format: 'best'
        });

        const metadata = {
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration_string || 'Unknown',
            platform: platform || 'video',
            originalUrl: url
        };

        if (typeof output.duration === 'number') {
            const minutes = Math.floor(output.duration / 60);
            const seconds = output.duration % 60;
            metadata.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        res.json(metadata);
    } catch (error: any) {
        console.error('Error fetching info:', error.message);
        res.status(500).json({ error: 'Failed to fetch video info', details: error.message });
    }
});

app.post('/api/download', async (req: any, res: any) => {
    const { url, format, title } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    // Sanitize title
    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    const timestamp = Date.now();
    const extension = format === 'mp3' ? 'mp3' : 'mp4';
    const filename = `${safeTitle}_${timestamp}.${extension}`;
    const outputPath = path.join(downloadsDir, filename);

    console.log(`[DOWNLOAD] Processing: ${url} -> ${outputPath}`);

    // Construct flags for yt-dlp-exec
    const flags: any = {
        noWarnings: true,
        noPlaylist: true,
        noCheckCertificates: true,
        userAgent: USER_AGENT,
        output: outputPath,
        ffmpegLocation: require('ffmpeg-static')
    };

    if (format === 'mp3') {
        flags.extractAudio = true;
        flags.audioFormat = 'mp3';
        flags.audioQuality = 0;
        flags.format = 'bestaudio/best';
    } else {
        // Use combined 'best' format to avoid 403 errors with separate streams
        flags.format = 'best[ext=mp4]/best';
    }

    try {
        await YTDlpWrap(url, flags);

        console.log('[DOWNLOAD] Complete, checking file...');
        if (!fs.existsSync(outputPath)) {
            throw new Error('Output file not found after download');
        }

        const stats = fs.statSync(outputPath);
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);

        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);

        fileStream.on('end', () => cleanup(outputPath));
        fileStream.on('error', (err: any) => console.error('Stream error:', err));

    } catch (error: any) {
        console.error('Download failed:', error);
        res.status(500).json({ error: 'Download failed', details: error.message });
        cleanup(outputPath);
    }
});

// --- NEXT.JS HANDLER (Fallthrough) ---
// This ensures that all other requests (like accessing the actual website) are handled by Next.js
nextApp.prepare().then(() => {
    app.all(/(.*)/, (req: any, res: any) => {
        return handle(req, res);
    });

    app.listen(PORT, (err?: any) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});
