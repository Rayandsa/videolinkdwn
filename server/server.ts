const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const next = require('next');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const dev = process.env.NODE_ENV !== 'production';
console.log(`[SERVER] Starting in ${dev ? 'development' : 'production'} mode`);
const nextApp = next({ dev, dir: process.cwd() });
const handle = nextApp.getRequestHandler();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const COOKIES_FILE = process.env.COOKIES_FILE || '/app/cookies.txt';
const COOKIES_INSTAGRAM = process.env.COOKIES_INSTAGRAM || '/app/cookies_instagram.txt';
const PO_TOKEN = process.env.PO_TOKEN || '';
const VISITOR_DATA = process.env.VISITOR_DATA || '';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Python script path
const YOUTUBE_SCRIPT = process.env.NODE_ENV === 'production'
    ? '/app/scripts/youtube_download.py'
    : path.join(__dirname, '..', 'scripts', 'youtube_download.py');

// Token status
let tokenStatus = {
    isValid: true,
    lastCheck: new Date(),
    errorCount: 0,
    lastError: ''
};

app.use(cors());
app.use(express.json());

// Helpers
const hasCookies = (file: string = COOKIES_FILE): boolean => fs.existsSync(file);
const detectPlatform = (url: string): string => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
};

// Execute Python script
const runPythonScript = (args: string[]): Promise<any> => {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            PO_TOKEN: PO_TOKEN,
            VISITOR_DATA: VISITOR_DATA
        };

        console.log(`[PYTHON] Running: python3 ${YOUTUBE_SCRIPT} ${args.join(' ')}`);

        const python = spawn('python3', [YOUTUBE_SCRIPT, ...args], { env });
        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            stdout += text;
            // Log progress
            if (text.includes('[PYTUBEFIX]') || text.includes('[FFMPEG]')) {
                console.log(text.trim());
            }
        });

        python.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
            console.error('[PYTHON STDERR]', data.toString());
        });

        python.on('close', (code: number) => {
            if (code !== 0) {
                reject(new Error(`Python script exited with code ${code}: ${stderr}`));
                return;
            }

            // Parse JSON from last line of stdout
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];

            try {
                const result = JSON.parse(lastLine);
                resolve(result);
            } catch (e) {
                reject(new Error(`Failed to parse Python output: ${lastLine}`));
            }
        });

        python.on('error', (err: Error) => {
            reject(err);
        });
    });
};

// yt-dlp command builder for non-YouTube platforms
const buildYtDlpCommand = (url: string, args: string[] = []): string => {
    const cmdArgs: string[] = ['yt-dlp'];

    // Add cookies
    if (detectPlatform(url) === 'instagram' && hasCookies(COOKIES_INSTAGRAM)) {
        cmdArgs.push(`--cookies "${COOKIES_INSTAGRAM}"`);
    } else if (hasCookies(COOKIES_FILE)) {
        cmdArgs.push(`--cookies "${COOKIES_FILE}"`);
    }

    cmdArgs.push('--no-warnings', '--no-check-certificates', `--user-agent "${USER_AGENT}"`, '--no-playlist');
    cmdArgs.push(...args);
    cmdArgs.push(`"${url}"`);

    return cmdArgs.join(' ');
};

// Cleanup helper
const cleanup = (files: string | string[]) => {
    const paths = Array.isArray(files) ? files : [files];
    setTimeout(() => {
        paths.forEach(file => {
            if (file && fs.existsSync(file)) {
                fs.unlink(file, () => console.log(`[CLEANUP] Deleted: ${path.basename(file)}`));
            }
        });
    }, 5000);
};

// Log errors
const logError = (context: string, error: any) => {
    console.error('='.repeat(60));
    console.error(`[ERROR] ${context}`);
    console.error(`[ERROR] ${error.message}`);
    if (error.stderr) console.error(`[STDERR] ${error.stderr}`);
    console.error('='.repeat(60));
};

// --- API ROUTES ---

// Token status endpoint
app.get('/api/token-status', (req: any, res: any) => {
    res.json({
        ...tokenStatus,
        hasPOToken: !!PO_TOKEN,
        hasVisitorData: !!VISITOR_DATA,
        hasCookies: hasCookies(),
        engine: 'pytubefix + yt-dlp'
    });
});

// Video info endpoint
app.post('/api/info', async (req: any, res: any) => {
    const { url, platform } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const detectedPlatform = detectPlatform(url);
    console.log(`[INFO] Platform: ${detectedPlatform}, URL: ${url}`);

    try {
        let metadata: any;

        if (detectedPlatform === 'youtube') {
            // Use pytubefix for YouTube
            console.log('[INFO] Using pytubefix engine');
            const result = await runPythonScript(['info', url]);

            if (!result.success) {
                throw new Error(result.error);
            }

            metadata = {
                title: result.title,
                thumbnail: result.thumbnail,
                duration: result.length ? `${Math.floor(result.length / 60)}:${(result.length % 60).toString().padStart(2, '0')}` : 'Unknown',
                platform: 'youtube',
                originalUrl: url,
                author: result.author,
                views: result.views
            };

            tokenStatus.isValid = true;
            tokenStatus.lastCheck = new Date();

        } else {
            // Use yt-dlp for other platforms
            console.log('[INFO] Using yt-dlp engine');
            const command = buildYtDlpCommand(url, ['--dump-json', '-f', 'best']);
            const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
            const output = JSON.parse(stdout);

            metadata = {
                title: output.title,
                thumbnail: output.thumbnail,
                duration: output.duration_string || 'Unknown',
                platform: detectedPlatform,
                originalUrl: url
            };
        }

        console.log(`[INFO] Success: "${metadata.title}"`);
        res.json(metadata);

    } catch (error: any) {
        logError('Fetching video info', error);

        if (detectedPlatform === 'youtube') {
            tokenStatus.isValid = false;
            tokenStatus.errorCount++;
            tokenStatus.lastError = error.message;
        }

        res.status(500).json({
            error: 'Failed to fetch video info',
            details: error.message,
            suggestion: detectedPlatform === 'youtube' ? 'PO_TOKEN may need to be updated' : null
        });
    }
});

// Download endpoint
app.post('/api/download', async (req: any, res: any) => {
    const { url, format, title } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const detectedPlatform = detectPlatform(url);
    console.log(`[DOWNLOAD] Platform: ${detectedPlatform}, Format: ${format}`);

    // Downloads directory
    const downloadsDir = process.env.NODE_ENV === 'production'
        ? '/app/dist/downloads'
        : path.join(__dirname, 'downloads');

    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    const timestamp = Date.now();
    const extension = format === 'mp3' ? 'mp3' : 'mp4';
    const filenameBase = `${safeTitle}_${timestamp}`;
    const filename = `${filenameBase}.${extension}`;
    const outputPath = path.join(downloadsDir, filename);

    console.log(`[DOWNLOAD] Output: ${filename}`);

    try {
        if (detectedPlatform === 'youtube') {
            // Use pytubefix for YouTube
            console.log('[DOWNLOAD] Using pytubefix engine for YouTube');

            const result = await runPythonScript([
                'download',
                url,
                downloadsDir,
                filenameBase,
                format === 'mp3' ? 'mp3' : 'mp4'
            ]);

            if (!result.success) {
                throw new Error(result.error || 'Download failed');
            }

            console.log(`[DOWNLOAD] pytubefix completed: ${result.path}`);

            // Verify file exists
            const finalPath = result.path;
            if (!fs.existsSync(finalPath)) {
                throw new Error(`Output file not found: ${finalPath}`);
            }

            const stats = fs.statSync(finalPath);
            console.log(`[DOWNLOAD] Success! Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            // Stream to response
            res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', stats.size);

            const fileStream = fs.createReadStream(finalPath);
            fileStream.pipe(res);
            fileStream.on('end', () => cleanup(finalPath));

            tokenStatus.isValid = true;
            tokenStatus.lastCheck = new Date();

        } else {
            // Use yt-dlp for Instagram, TikTok, etc.
            console.log(`[DOWNLOAD] Using yt-dlp engine for ${detectedPlatform}`);

            let downloadArgs: string[];

            if (format === 'mp3') {
                downloadArgs = [
                    '-f', 'bestaudio/best',
                    '-x', '--audio-format', 'mp3',
                    '--audio-quality', '0',
                    '--ffmpeg-location', '/usr/bin/ffmpeg',
                    '-o', `"${outputPath}"`
                ];
            } else {
                downloadArgs = [
                    '-f', '"bestvideo+bestaudio/best"',
                    '--merge-output-format', 'mp4',
                    '--ffmpeg-location', '/usr/bin/ffmpeg',
                    '-o', `"${outputPath}"`
                ];
            }

            const command = buildYtDlpCommand(url, downloadArgs);
            console.log(`[YT-DLP] ${command}`);

            await execAsync(command, { maxBuffer: 200 * 1024 * 1024, timeout: 600000 });

            // Find output file
            let finalPath = outputPath;
            if (!fs.existsSync(outputPath)) {
                const files = fs.readdirSync(downloadsDir);
                const match = files.find((f: string) => f.includes(filenameBase));
                if (match) {
                    finalPath = path.join(downloadsDir, match);
                } else {
                    throw new Error('Output file not found');
                }
            }

            const stats = fs.statSync(finalPath);
            console.log(`[DOWNLOAD] Success! Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', stats.size);

            const fileStream = fs.createReadStream(finalPath);
            fileStream.pipe(res);
            fileStream.on('end', () => cleanup(finalPath));
        }

    } catch (error: any) {
        logError('Download', error);

        let userMessage = 'Download failed';
        if (error.message.includes('token') || error.message.includes('Sign in')) {
            userMessage = 'YouTube authentication failed. Please update PO_TOKEN.';
            tokenStatus.isValid = false;
            tokenStatus.errorCount++;
            tokenStatus.lastError = error.message;
        }

        res.status(500).json({
            error: userMessage,
            details: error.message,
            platform: detectedPlatform
        });

        cleanup(outputPath);
    }
});

// --- NEXT.JS HANDLER ---
nextApp.prepare().then(() => {
    app.all(/(.*)/, (req: any, res: any) => handle(req, res));

    app.listen(PORT, (err?: any) => {
        if (err) throw err;
        console.log('');
        console.log('='.repeat(55));
        console.log('  VIDEO LINK DOWNLOADER');
        console.log('  Engine: pytubefix (YouTube) + yt-dlp (Instagram/TikTok)');
        console.log('='.repeat(55));
        console.log(`  URL: http://localhost:${PORT}`);
        console.log('');
        console.log('  Configuration:');
        console.log(`  ├─ PO-Token: ${PO_TOKEN ? '✓ (' + PO_TOKEN.substring(0, 8) + '...)' : '✗ NOT SET'}`);
        console.log(`  ├─ Visitor Data: ${VISITOR_DATA ? '✓' : '✗ NOT SET'}`);
        console.log(`  ├─ YouTube cookies: ${hasCookies(COOKIES_FILE) ? '✓' : '✗'}`);
        console.log(`  └─ Instagram cookies: ${hasCookies(COOKIES_INSTAGRAM) ? '✓' : '✗'}`);
        console.log('');
        console.log(`  Python script: ${YOUTUBE_SCRIPT}`);
        console.log(`  Script exists: ${fs.existsSync(YOUTUBE_SCRIPT) ? '✓' : '✗'}`);
        console.log('='.repeat(55));
    });
});
