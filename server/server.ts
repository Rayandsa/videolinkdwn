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
const COOKIES_INSTAGRAM = process.env.COOKIES_INSTAGRAM || '/app/cookies_instagram.txt';
const PO_TOKEN = process.env.PO_TOKEN || '';
const VISITOR_DATA = process.env.VISITOR_DATA || '';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

app.use(cors());
app.use(express.json());

// Helper: Check if cookies file exists
const hasCookies = (cookieFile: string = COOKIES_FILE): boolean => {
    const exists = fs.existsSync(cookieFile);
    if (exists) {
        console.log(`[COOKIES] Found: ${cookieFile}`);
    }
    return exists;
};

// Helper: Detect platform from URL
const detectPlatform = (url: string): string => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
};

// Helper: Build yt-dlp command with 2026 method authentication
const buildYtDlpCommand = (url: string, additionalArgs: string[] = [], forceYouTubeAuth: boolean = false): string => {
    const args: string[] = ['yt-dlp'];
    const platform = detectPlatform(url);

    console.log(`[YT-DLP] Building command for platform: ${platform}`);

    // Platform-specific cookies
    if (platform === 'instagram') {
        // Use Instagram-specific cookies if available
        if (hasCookies(COOKIES_INSTAGRAM)) {
            args.push(`--cookies "${COOKIES_INSTAGRAM}"`);
            console.log('[YT-DLP] Using Instagram cookies file');
        } else if (hasCookies(COOKIES_FILE)) {
            args.push(`--cookies "${COOKIES_FILE}"`);
            console.log('[YT-DLP] Using generic cookies file for Instagram');
        } else {
            console.log('[YT-DLP] WARNING: No Instagram cookies available - Oracle IPs may be blocked!');
        }
    } else if (platform === 'youtube' || forceYouTubeAuth) {
        // YouTube authentication with 2026 method
        if (hasCookies(COOKIES_FILE)) {
            args.push(`--cookies "${COOKIES_FILE}"`);
        }

        // PO-Token and Visitor Data - CRITICAL for YouTube downloads
        if (PO_TOKEN) {
            // Use extractor-args for authentication
            args.push(`--extractor-args "youtube:player_client=web,default;po_token=web+${PO_TOKEN}"`);
            console.log('[YT-DLP] Using PO-Token for YouTube authentication');
        }

        if (VISITOR_DATA) {
            args.push(`--extractor-args "youtube:visitor_data=${VISITOR_DATA}"`);
            console.log('[YT-DLP] Using Visitor Data for YouTube');
        }
    } else {
        // Generic - use main cookies file if available
        if (hasCookies(COOKIES_FILE)) {
            args.push(`--cookies "${COOKIES_FILE}"`);
        }
    }

    // Common arguments
    args.push('--no-warnings');
    args.push('--no-check-certificates');
    args.push(`--user-agent "${USER_AGENT}"`);
    args.push('--no-playlist');
    args.push('--verbose'); // Enable verbose for debugging

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
                    if (err) console.error(`[CLEANUP] Error deleting ${filePath}:`, err);
                    else console.log(`[CLEANUP] Deleted: ${filePath}`);
                });
            }
        });
    }, 5000);
};

// Helper: Log detailed error from yt-dlp
const logYtDlpError = (error: any, context: string) => {
    console.error('='.repeat(60));
    console.error(`[YT-DLP ERROR] Context: ${context}`);
    console.error(`[YT-DLP ERROR] Message: ${error.message}`);
    if (error.stderr) {
        console.error(`[YT-DLP ERROR] STDERR Output:`);
        console.error(error.stderr);
    }
    if (error.stdout) {
        console.error(`[YT-DLP ERROR] STDOUT Output:`);
        console.error(error.stdout);
    }
    console.error('='.repeat(60));
};

// --- API ROUTES ---

app.post('/api/info', async (req: any, res: any) => {
    const { url, platform } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[INFO] Fetching metadata for: ${url}`);
    const detectedPlatform = detectPlatform(url);
    console.log(`[INFO] Detected platform: ${detectedPlatform}`);

    try {
        const command = buildYtDlpCommand(url, ['--dump-json', '-f best'], detectedPlatform === 'youtube');
        console.log(`[YT-DLP] Info command: ${command.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

        const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });

        if (stderr) {
            console.log('[YT-DLP] Stderr (info):', stderr);
        }

        const output = JSON.parse(stdout);

        const metadata = {
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration_string || 'Unknown',
            platform: platform || detectedPlatform,
            originalUrl: url
        };

        if (typeof output.duration === 'number') {
            const minutes = Math.floor(output.duration / 60);
            const seconds = output.duration % 60;
            metadata.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        console.log(`[INFO] Success: ${metadata.title}`);
        res.json(metadata);
    } catch (error: any) {
        logYtDlpError(error, 'Fetching video info');
        res.status(500).json({
            error: 'Failed to fetch video info',
            details: error.message,
            stderr: error.stderr || 'No stderr available'
        });
    }
});

app.post('/api/download', async (req: any, res: any) => {
    const { url, format, title } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const detectedPlatform = detectPlatform(url);
    console.log(`[DOWNLOAD] Platform: ${detectedPlatform}, URL: ${url}`);

    // Use absolute path for downloads directory (matches Dockerfile)
    const downloadsDir = process.env.NODE_ENV === 'production'
        ? '/app/dist/downloads'
        : path.join(__dirname, 'downloads');

    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
        console.log(`[DOWNLOAD] Created directory: ${downloadsDir}`);
    }

    // Sanitize title
    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    const timestamp = Date.now();
    const extension = format === 'mp3' ? 'mp3' : 'mp4';
    const filename = `${safeTitle}_${timestamp}.${extension}`;
    const outputPath = path.join(downloadsDir, filename);

    // Temporary file paths for video/audio merge
    const tempVideoPath = path.join(downloadsDir, `${safeTitle}_${timestamp}_video.mp4`);
    const tempAudioPath = path.join(downloadsDir, `${safeTitle}_${timestamp}_audio.m4a`);

    console.log(`[DOWNLOAD] Output path: ${outputPath}`);

    try {
        if (format === 'mp3') {
            // Audio only download
            console.log('[DOWNLOAD] Mode: Audio extraction (MP3)');
            const downloadArgs = [
                '-f bestaudio',
                '-x',
                '--audio-format mp3',
                '--audio-quality 0',
                '--ffmpeg-location /usr/bin/ffmpeg',
                `-o "${outputPath}"`
            ];

            const command = buildYtDlpCommand(url, downloadArgs, detectedPlatform === 'youtube');
            console.log(`[YT-DLP] Audio command: ${command.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

            const { stderr } = await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });
            if (stderr) console.log('[YT-DLP] Audio download stderr:', stderr);

        } else if (detectedPlatform === 'youtube') {
            // YouTube: 2026 Method - Download video and audio separately, then merge
            console.log('[DOWNLOAD] Mode: YouTube 2026 method (separate streams + merge)');

            // Download best video with full authentication
            console.log('[YT-DLP] Step 1/3: Downloading video stream...');
            const videoArgs = [
                '-f "bestvideo[ext=mp4]/bestvideo"',
                '--ffmpeg-location /usr/bin/ffmpeg',
                `-o "${tempVideoPath}"`
            ];
            const videoCommand = buildYtDlpCommand(url, videoArgs, true); // Force YouTube auth
            console.log(`[YT-DLP] Video command: ${videoCommand.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

            try {
                const { stderr: videoStderr } = await execAsync(videoCommand, { maxBuffer: 200 * 1024 * 1024 });
                if (videoStderr) console.log('[YT-DLP] Video download stderr:', videoStderr);
            } catch (videoError: any) {
                logYtDlpError(videoError, 'YouTube video stream download');
                throw videoError;
            }

            // Download best audio with full authentication
            console.log('[YT-DLP] Step 2/3: Downloading audio stream...');
            const audioArgs = [
                '-f "bestaudio[ext=m4a]/bestaudio"',
                '--ffmpeg-location /usr/bin/ffmpeg',
                `-o "${tempAudioPath}"`
            ];
            const audioCommand = buildYtDlpCommand(url, audioArgs, true); // Force YouTube auth
            console.log(`[YT-DLP] Audio command: ${audioCommand.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

            try {
                const { stderr: audioStderr } = await execAsync(audioCommand, { maxBuffer: 200 * 1024 * 1024 });
                if (audioStderr) console.log('[YT-DLP] Audio download stderr:', audioStderr);
            } catch (audioError: any) {
                logYtDlpError(audioError, 'YouTube audio stream download');
                throw audioError;
            }

            // Merge with ffmpeg
            console.log('[YT-DLP] Step 3/3: Merging video and audio with FFmpeg...');
            const mergeCommand = `ffmpeg -i "${tempVideoPath}" -i "${tempAudioPath}" -c:v copy -c:a aac -strict experimental "${outputPath}" -y`;
            console.log(`[FFMPEG] Merge command: ${mergeCommand}`);

            try {
                const { stderr: mergeStderr } = await execAsync(mergeCommand, { maxBuffer: 200 * 1024 * 1024 });
                if (mergeStderr) console.log('[FFMPEG] Merge stderr:', mergeStderr);
            } catch (mergeError: any) {
                logYtDlpError(mergeError, 'FFmpeg merge');
                throw mergeError;
            }

            // Cleanup temporary files
            console.log('[CLEANUP] Removing temporary video and audio files...');
            cleanup([tempVideoPath, tempAudioPath]);

        } else {
            // Instagram, TikTok, others: Simple download
            console.log(`[DOWNLOAD] Mode: Simple download for ${detectedPlatform}`);
            const downloadArgs = [
                '-f "best[ext=mp4]/best"',
                '--ffmpeg-location /usr/bin/ffmpeg',
                `-o "${outputPath}"`
            ];

            const command = buildYtDlpCommand(url, downloadArgs, false);
            console.log(`[YT-DLP] Download command: ${command.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

            const { stderr } = await execAsync(command, { maxBuffer: 100 * 1024 * 1024 });
            if (stderr) console.log('[YT-DLP] Download stderr:', stderr);
        }

        console.log('[DOWNLOAD] Processing complete, checking file...');

        // Wait a bit for filesystem to sync
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if output file exists
        let finalOutputPath = outputPath;
        if (!fs.existsSync(outputPath)) {
            // Check for file with different extension
            const possiblePaths = [
                outputPath,
                outputPath.replace('.mp4', '.webm'),
                outputPath.replace('.mp4', '.mkv'),
                outputPath.replace('.mp3', '.m4a'),
                outputPath.replace('.mp3', '.opus')
            ];

            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    finalOutputPath = p;
                    console.log(`[DOWNLOAD] Found file at: ${finalOutputPath}`);
                    break;
                }
            }

            if (!fs.existsSync(finalOutputPath)) {
                // List directory to debug
                console.log(`[DOWNLOAD] Files in ${downloadsDir}:`);
                const files = fs.readdirSync(downloadsDir);
                files.forEach((f: string) => console.log(`  - ${f}`));
                throw new Error(`Output file not found. Expected: ${outputPath}`);
            }
        }

        const stats = fs.statSync(finalOutputPath);
        console.log(`[DOWNLOAD] Success! File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);

        const fileStream = fs.createReadStream(finalOutputPath);
        fileStream.pipe(res);

        fileStream.on('end', () => cleanup(finalOutputPath));
        fileStream.on('error', (err: any) => {
            console.error('[STREAM] Error:', err);
        });

    } catch (error: any) {
        logYtDlpError(error, 'Download process');
        res.status(500).json({
            error: 'Download failed',
            details: error.message,
            stderr: error.stderr || 'No stderr available'
        });
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
        console.log('='.repeat(50));
        console.log('[CONFIG] Environment:');
        console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`  - YouTube cookies: ${hasCookies(COOKIES_FILE) ? 'Found' : 'NOT FOUND'} (${COOKIES_FILE})`);
        console.log(`  - Instagram cookies: ${hasCookies(COOKIES_INSTAGRAM) ? 'Found' : 'NOT FOUND'} (${COOKIES_INSTAGRAM})`);
        console.log(`  - PO-Token: ${PO_TOKEN ? 'Configured (' + PO_TOKEN.substring(0, 10) + '...)' : 'NOT SET'}`);
        console.log(`  - Visitor Data: ${VISITOR_DATA ? 'Configured' : 'NOT SET'}`);
        console.log('='.repeat(50));
    });
});
