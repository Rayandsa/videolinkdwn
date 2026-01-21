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

// Configuration
const COOKIES_FILE = process.env.COOKIES_FILE || '/app/cookies.txt';
const COOKIES_INSTAGRAM = process.env.COOKIES_INSTAGRAM || '/app/cookies_instagram.txt';
const PO_TOKEN = process.env.PO_TOKEN || '';
const VISITOR_DATA = process.env.VISITOR_DATA || '';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Token status tracking
let tokenStatus = {
    isValid: true,
    lastCheck: new Date(),
    errorCount: 0,
    lastError: ''
};

app.use(cors());
app.use(express.json());

// Helper: Check if cookies file exists
const hasCookies = (cookieFile: string = COOKIES_FILE): boolean => {
    return fs.existsSync(cookieFile);
};

// Helper: Detect platform from URL
const detectPlatform = (url: string): string => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
};

// Helper: Check if error indicates token expiration
const isTokenError = (errorMessage: string): boolean => {
    const tokenErrors = [
        'Sign in to confirm',
        'po_token',
        'visitor_data',
        'This video is not available',
        'Private video',
        'bot',
        'confirm your age',
        'cookies'
    ];
    return tokenErrors.some(err => errorMessage.toLowerCase().includes(err.toLowerCase()));
};

// Helper: Update token status
const updateTokenStatus = (isValid: boolean, error?: string) => {
    tokenStatus.isValid = isValid;
    tokenStatus.lastCheck = new Date();
    if (!isValid) {
        tokenStatus.errorCount++;
        tokenStatus.lastError = error || 'Unknown error';
    } else {
        tokenStatus.errorCount = 0;
        tokenStatus.lastError = '';
    }
};

// Helper: Build yt-dlp command - UNIVERSAL VERSION
const buildYtDlpCommand = (url: string, additionalArgs: string[] = []): string => {
    const args: string[] = ['yt-dlp'];
    const platform = detectPlatform(url);

    // Platform-specific cookies
    if (platform === 'instagram') {
        if (hasCookies(COOKIES_INSTAGRAM)) {
            args.push(`--cookies "${COOKIES_INSTAGRAM}"`);
        } else if (hasCookies(COOKIES_FILE)) {
            args.push(`--cookies "${COOKIES_FILE}"`);
        }
    } else if (platform === 'youtube') {
        if (hasCookies(COOKIES_FILE)) {
            args.push(`--cookies "${COOKIES_FILE}"`);
        }
        // YouTube authentication
        if (PO_TOKEN) {
            args.push(`--extractor-args "youtube:player_client=web,default;po_token=web+${PO_TOKEN}"`);
        }
        if (VISITOR_DATA) {
            args.push(`--extractor-args "youtube:visitor_data=${VISITOR_DATA}"`);
        }
    } else {
        if (hasCookies(COOKIES_FILE)) {
            args.push(`--cookies "${COOKIES_FILE}"`);
        }
    }

    // Common arguments
    args.push('--no-warnings');
    args.push('--no-check-certificates');
    args.push(`--user-agent "${USER_AGENT}"`);
    args.push('--no-playlist');

    // Add additional arguments
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
                    if (err) console.error(`[CLEANUP] Error: ${err.message}`);
                    else console.log(`[CLEANUP] Deleted: ${path.basename(filePath)}`);
                });
            }
        });
    }, 5000);
};

// Helper: Log detailed error
const logError = (context: string, error: any) => {
    console.error('='.repeat(60));
    console.error(`[ERROR] ${context}`);
    console.error(`[ERROR] Message: ${error.message}`);
    if (error.stderr) console.error(`[ERROR] STDERR:\n${error.stderr}`);
    if (error.stdout) console.error(`[ERROR] STDOUT:\n${error.stdout}`);
    console.error('='.repeat(60));

    // Check for token-related errors
    const fullError = `${error.message} ${error.stderr || ''}`;
    if (isTokenError(fullError)) {
        updateTokenStatus(false, fullError);
        console.error('[TOKEN] Possible token expiration detected!');
    }
};

// --- API ROUTES ---

// Token status endpoint
app.get('/api/token-status', (req: any, res: any) => {
    res.json({
        isValid: tokenStatus.isValid,
        lastCheck: tokenStatus.lastCheck,
        errorCount: tokenStatus.errorCount,
        lastError: tokenStatus.lastError,
        hasPOToken: !!PO_TOKEN,
        hasVisitorData: !!VISITOR_DATA,
        hasCookies: hasCookies(COOKIES_FILE)
    });
});

// Video info endpoint
app.post('/api/info', async (req: any, res: any) => {
    const { url, platform } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[INFO] Fetching: ${url}`);
    const detectedPlatform = detectPlatform(url);

    try {
        // Universal format selection - don't force container
        const command = buildYtDlpCommand(url, [
            '--dump-json',
            '-f', 'best'
        ]);
        console.log(`[YT-DLP] ${command.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

        const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
        if (stderr) console.log('[YT-DLP] Stderr:', stderr.substring(0, 200));

        const output = JSON.parse(stdout);

        // Update token status on success
        if (detectedPlatform === 'youtube') {
            updateTokenStatus(true);
        }

        const metadata = {
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration_string || 'Unknown',
            platform: platform || detectedPlatform,
            originalUrl: url,
            tokenStatus: detectedPlatform === 'youtube' ? tokenStatus.isValid : null
        };

        if (typeof output.duration === 'number') {
            const minutes = Math.floor(output.duration / 60);
            const seconds = output.duration % 60;
            metadata.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        console.log(`[INFO] Success: "${metadata.title}"`);
        res.json(metadata);

    } catch (error: any) {
        logError('Fetching video info', error);

        const errorDetails = error.stderr || error.message;
        const isTokenIssue = isTokenError(errorDetails);

        res.status(500).json({
            error: 'Failed to fetch video info',
            details: error.message,
            isTokenIssue,
            tokenStatus: isTokenIssue ? 'PO_TOKEN may be expired. Please update it.' : null
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
    const filename = `${safeTitle}_${timestamp}.${extension}`;
    const outputPath = path.join(downloadsDir, filename);

    console.log(`[DOWNLOAD] Output: ${filename}`);

    try {
        let downloadArgs: string[];

        if (format === 'mp3') {
            // Audio extraction
            console.log('[DOWNLOAD] Mode: Audio (MP3)');
            downloadArgs = [
                '-f', 'bestaudio/best',
                '-x',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--ffmpeg-location', '/usr/bin/ffmpeg',
                '-o', `"${outputPath}"`
            ];

        } else {
            // Video download - UNIVERSAL: Accept any format, convert to MP4
            console.log('[DOWNLOAD] Mode: Video (Universal -> MP4)');

            // Format selection with fallbacks (from best to acceptable)
            // This accepts WebM, MP4, or any format and converts to MP4
            downloadArgs = [
                // Best video + best audio, any container
                '-f', '"bestvideo+bestaudio/best"',
                // Force output to MP4 (FFmpeg will convert if needed)
                '--merge-output-format', 'mp4',
                // FFmpeg location for merging/conversion
                '--ffmpeg-location', '/usr/bin/ffmpeg',
                // Post-processing to ensure MP4 compatibility
                '--postprocessor-args', '"-c:v libx264 -c:a aac -movflags +faststart"',
                // Output path
                '-o', `"${outputPath}"`
            ];
        }

        const command = buildYtDlpCommand(url, downloadArgs);
        console.log(`[YT-DLP] ${command.replace(PO_TOKEN, '***').replace(VISITOR_DATA, '***')}`);

        // Execute download with generous timeout
        const { stdout, stderr } = await execAsync(command, {
            maxBuffer: 200 * 1024 * 1024,
            timeout: 10 * 60 * 1000 // 10 minutes timeout
        });

        if (stderr) console.log('[YT-DLP] Stderr:', stderr.substring(0, 500));
        if (stdout) console.log('[YT-DLP] Stdout:', stdout.substring(0, 500));

        // Update token status on success
        if (detectedPlatform === 'youtube') {
            updateTokenStatus(true);
        }

        console.log('[DOWNLOAD] Command completed, checking file...');

        // Wait for filesystem sync
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Find the output file (might have different name)
        let finalPath = outputPath;
        if (!fs.existsSync(outputPath)) {
            // Look for files with similar name
            const files = fs.readdirSync(downloadsDir);
            const matchingFile = files.find((f: string) =>
                f.includes(safeTitle) && f.includes(String(timestamp))
            );

            if (matchingFile) {
                finalPath = path.join(downloadsDir, matchingFile);
                console.log(`[DOWNLOAD] Found file: ${matchingFile}`);
            } else {
                console.log(`[DOWNLOAD] Files in dir: ${files.join(', ')}`);
                throw new Error('Output file not found after download');
            }
        }

        const stats = fs.statSync(finalPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`[DOWNLOAD] Success! Size: ${fileSizeMB} MB`);

        // Stream file to response
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);

        const fileStream = fs.createReadStream(finalPath);
        fileStream.pipe(res);
        fileStream.on('end', () => cleanup(finalPath));
        fileStream.on('error', (err: any) => console.error('[STREAM] Error:', err));

    } catch (error: any) {
        logError('Download process', error);

        const errorDetails = error.stderr || error.message;
        const isTokenIssue = isTokenError(errorDetails);

        // Determine error type for user-friendly message
        let userMessage = 'Download failed';
        if (isTokenIssue) {
            userMessage = 'YouTube authentication failed. PO_TOKEN may need to be updated.';
        } else if (errorDetails.includes('format')) {
            userMessage = 'Requested format not available. Try again with different quality.';
        } else if (errorDetails.includes('403')) {
            userMessage = 'Access denied by YouTube. Authentication tokens may have expired.';
        }

        res.status(500).json({
            error: userMessage,
            details: error.message,
            isTokenIssue,
            suggestion: isTokenIssue ? 'Please update PO_TOKEN and VISITOR_DATA in environment variables.' : null
        });

        cleanup(outputPath);
    }
});

// --- NEXT.JS HANDLER ---
nextApp.prepare().then(() => {
    app.all(/(.*)/, (req: any, res: any) => {
        return handle(req, res);
    });

    app.listen(PORT, (err?: any) => {
        if (err) throw err;
        console.log('');
        console.log('='.repeat(50));
        console.log(`  VIDEO LINK DOWNLOADER - Ready`);
        console.log('='.repeat(50));
        console.log(`  URL: http://localhost:${PORT}`);
        console.log('');
        console.log('  Configuration:');
        console.log(`  ├─ YouTube cookies: ${hasCookies(COOKIES_FILE) ? '✓' : '✗'}`);
        console.log(`  ├─ Instagram cookies: ${hasCookies(COOKIES_INSTAGRAM) ? '✓' : '✗'}`);
        console.log(`  ├─ PO-Token: ${PO_TOKEN ? '✓ (' + PO_TOKEN.substring(0, 8) + '...)' : '✗ NOT SET'}`);
        console.log(`  └─ Visitor Data: ${VISITOR_DATA ? '✓' : '✗ NOT SET'}`);
        console.log('');
        if (!PO_TOKEN) {
            console.log('  ⚠️  WARNING: PO_TOKEN not set. YouTube downloads may fail!');
        }
        console.log('='.repeat(50));
    });
});
