const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const next = require('next');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const dev = process.env.NODE_ENV !== 'production';
console.log(`[SERVER] Starting in ${dev ? 'development' : 'production'} mode`);
const nextApp = next({ dev, dir: process.cwd() });
const handle = nextApp.getRequestHandler();

const app = express();
const PORT = process.env.PORT || 3000;

// 2026 Method Configuration
const COOKIES_FILE = process.env.COOKIES_FILE || '/app/cookies.txt';
const PO_TOKEN = process.env.PO_TOKEN || '';
const VISITOR_DATA = process.env.VISITOR_DATA || '';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

app.use(cors());
app.use(express.json());

// Helper: Check if cookies file exists
const hasCookies = (): boolean => {
    return fs.existsSync(COOKIES_FILE);
};

// Helper: Build yt-dlp command with 2026 method authentication
const buildYtDlpCommand = (url: string, additionalArgs: string[] = []): string => {
    const args: string[] = ['yt-dlp'];

    // Add cookies if available
    if (hasCookies()) {
        args.push(`--cookies "${COOKIES_FILE}"`);
        console.log('[YT-DLP] Using cookies file for authentication');
    }

    // Add PO-Token if available (2026 method)
    if (PO_TOKEN) {
        args.push(`--extractor-args "youtube:player_client=web,default;po_token=web+${PO_TOKEN}"`);
        console.log('[YT-DLP] Using PO-Token for authentication');
    }

    // Add Visitor Data if available
    if (VISITOR_DATA) {
        args.push(`--extractor-args "youtube:visitor_data=${VISITOR_DATA}"`);
        console.log('[YT-DLP] Using Visitor Data');
    }

    // Common arguments
    args.push('--no-warnings');
    args.push('--no-check-certificates');
    args.push(`--user-agent "${USER_AGENT}"`);
    args.push('--no-playlist');

    // Add any additional arguments
    args.push(...additionalArgs);

    // Add the URL
    args.push(`"${url}"`);

    return args.join(' ');
};

// Helper: Cleanup temporary files
const cleanup = (filePaths: string | string[]) => {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    setTimeout(() => {
        paths.forEach(filePath => {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, (err: any) => {
                    if (err) console.error(`Error deleting temp file ${filePath}:`, err);
                    else console.log(`[CLEANUP] Deleted: ${filePath}`);
                });
            }
        });
    }, 5000);
};

// Helper: Cleanup multiple files matching pattern
const cleanupPattern = (dir: string, pattern: string) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    files.forEach((file: string) => {
        if (file.includes(pattern)) {
            const filePath = path.join(dir, file);
            fs.unlink(filePath, (err: any) => {
                if (err) console.error(`Error deleting ${filePath}:`, err);
                else console.log(`[CLEANUP] Deleted temporary file: ${file}`);
            });
        }
    });
};

// --- API ROUTES ---

app.post('/api/info', async (req: any, res: any) => {
    const { url, platform } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[INFO] Fetching metadata for: ${url}`);

    try {
        const command = buildYtDlpCommand(url, ['--dump-json', '-f best']);
        console.log(`[YT-DLP] Command: ${command.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

        const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
        const output = JSON.parse(stdout);

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
        console.error('Stderr:', error.stderr);
        res.status(500).json({ error: 'Failed to fetch video info', details: error.message });
    }
});

app.post('/api/download', async (req: any, res: any) => {
    const { url, format, title } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Use absolute path for downloads directory (matches Dockerfile)
    const downloadsDir = process.env.NODE_ENV === 'production'
        ? '/app/dist/downloads'
        : path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    // Sanitize title
    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    const timestamp = Date.now();
    const extension = format === 'mp3' ? 'mp3' : 'mp4';
    const filename = `${safeTitle}_${timestamp}.${extension}`;
    const outputPath = path.join(downloadsDir, filename);

    // Temporary file paths for video/audio merge
    const tempVideoPath = path.join(downloadsDir, `${safeTitle}_${timestamp}_video.mp4`);
    const tempAudioPath = path.join(downloadsDir, `${safeTitle}_${timestamp}_audio.m4a`);

    console.log(`[DOWNLOAD] Processing: ${url} -> ${outputPath}`);

    try {
        let downloadArgs: string[];

        if (format === 'mp3') {
            // Audio only download
            downloadArgs = [
                '-f bestaudio',
                '-x',
                '--audio-format mp3',
                '--audio-quality 0',
                `--ffmpeg-location /usr/bin/ffmpeg`,
                `-o "${outputPath}"`
            ];

            const command = buildYtDlpCommand(url, downloadArgs);
            console.log(`[YT-DLP] Audio command: ${command.replace(PO_TOKEN, '***')}`);
            await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });

        } else {
            // 2026 Method: Download best video + best audio separately, then merge with ffmpeg
            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

            if (isYouTube) {
                console.log('[DOWNLOAD] Using 2026 method: separate video+audio download with merge');

                // Download best video
                const videoArgs = [
                    '-f "bestvideo[ext=mp4]/bestvideo"',
                    `--ffmpeg-location /usr/bin/ffmpeg`,
                    `-o "${tempVideoPath}"`
                ];
                const videoCommand = buildYtDlpCommand(url, videoArgs);
                console.log('[YT-DLP] Downloading video stream...');
                await execAsync(videoCommand, { maxBuffer: 100 * 1024 * 1024 });

                // Download best audio
                const audioArgs = [
                    '-f "bestaudio[ext=m4a]/bestaudio"',
                    `--ffmpeg-location /usr/bin/ffmpeg`,
                    `-o "${tempAudioPath}"`
                ];
                const audioCommand = buildYtDlpCommand(url, audioArgs);
                console.log('[YT-DLP] Downloading audio stream...');
                await execAsync(audioCommand, { maxBuffer: 100 * 1024 * 1024 });

                // Merge with ffmpeg
                console.log('[FFMPEG] Merging video and audio...');
                const mergeCommand = `ffmpeg -i "${tempVideoPath}" -i "${tempAudioPath}" -c:v copy -c:a aac -strict experimental "${outputPath}" -y`;
                await execAsync(mergeCommand, { maxBuffer: 100 * 1024 * 1024 });

                // Cleanup temporary files
                console.log('[CLEANUP] Removing temporary video and audio files...');
                cleanup([tempVideoPath, tempAudioPath]);

            } else {
                // For non-YouTube (Instagram, TikTok), use simple best format
                downloadArgs = [
                    '-f "best[ext=mp4]/best"',
                    `--ffmpeg-location /usr/bin/ffmpeg`,
                    `-o "${outputPath}"`
                ];

                const command = buildYtDlpCommand(url, downloadArgs);
                console.log(`[YT-DLP] Command: ${command.replace(PO_TOKEN, '***')}`);
                await execAsync(command, { maxBuffer: 100 * 1024 * 1024 });
            }
        }

        console.log('[DOWNLOAD] Complete, checking file...');

        // Wait a bit for filesystem to sync
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!fs.existsSync(outputPath)) {
            // Check for file with different extension (yt-dlp might add .mp4 automatically)
            const possiblePaths = [
                outputPath,
                outputPath.replace('.mp4', '.webm'),
                outputPath.replace('.mp4', '.mkv')
            ];

            let foundPath = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    foundPath = p;
                    break;
                }
            }

            if (!foundPath) {
                throw new Error('Output file not found after download');
            }
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
        console.error('Download failed:', error.message);
        console.error('Stderr:', error.stderr);
        res.status(500).json({ error: 'Download failed', details: error.message });
        cleanup([outputPath, tempVideoPath, tempAudioPath]);
    }
});

// --- NEXT.JS HANDLER (Fallthrough) ---
nextApp.prepare().then(() => {
    app.all(/(.*)/, (req: any, res: any) => {
        return handle(req, res);
    });

    app.listen(PORT, (err?: any) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
        console.log(`> Cookies file: ${hasCookies() ? 'Found' : 'Not found'} at ${COOKIES_FILE}`);
        console.log(`> PO-Token: ${PO_TOKEN ? 'Configured' : 'Not set'}`);
        console.log(`> Visitor Data: ${VISITOR_DATA ? 'Configured' : 'Not set'}`);
    });
});
