const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Path to the manually installed yt-dlp binary
const YT_DLP_PATH = 'C:\\Users\\cliff\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const cleanup = (filePath: any) => {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err: any) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        }
    }, 5000); // Delay cleanup to ensure file is fully sent
};

// Helper: Run yt-dlp and get stdout
const runYtDlp = (args: string[]) => {
    const { spawn } = require('child_process');
    return new Promise<string>((resolve, reject) => {
        const process = spawn(YT_DLP_PATH, args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data: any) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data: any) => {
            stderr += data.toString();
        });

        process.on('close', (code: any) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
            }
        });
    });
};

app.post('/api/info', async (req: any, res: any) => {
    const { url, platform } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[INFO] Fetching metadata for: ${url} (${platform})`);

    const args = [
        url,
        '--dump-json',
        '--no-warnings',
        '--prefer-free-formats',
        '--user-agent', USER_AGENT
    ];

    try {
        const rawOutput = await runYtDlp(args);
        const output = JSON.parse(rawOutput);

        const metadata = {
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration_string || 'Unknown',
            platform: platform,
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

// POST download endpoint
app.post('/api/download', (req: any, res: any) => {
    const { url, format, title } = req.body;

    if (!url) return res.status(400).json({ error: 'URL required' });

    console.log(`[DOWNLOAD_START] URL: ${url} | Format: ${format} | Title: ${title}`);

    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    // Clean the downloads folder of old files
    try {
        const existingFiles = fs.readdirSync(downloadsDir);
        existingFiles.forEach((file: string) => {
            const filePath = path.join(downloadsDir, file);
            const stats = fs.statSync(filePath);
            // Delete files older than 1 hour
            if (Date.now() - stats.mtimeMs > 3600000) {
                fs.unlinkSync(filePath);
            }
        });
    } catch (e) {
        console.log('Cleanup skipped');
    }

    // Sanitize title for filename
    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    const timestamp = Date.now();
    const extension = format === 'mp3' ? 'mp3' : 'mp4';
    const filename = `${safeTitle}_${timestamp}.${extension}`;
    const outputPath = path.join(downloadsDir, filename);

    console.log(`[OUTPUT_PATH] ${outputPath}`);

    // Build command - Use explicit output format with extension
    let cmd = `"${YT_DLP_PATH}" --no-warnings --no-playlist --prefer-free-formats`;
    cmd += ` --user-agent "${USER_AGENT}"`;
    cmd += ` --ffmpeg-location "${ffmpegPath}"`;
    cmd += ` -o "${outputPath}"`;
    cmd += ` "${url}"`;

    if (format === 'mp3') {
        // For audio: extract and convert to mp3
        cmd += ' --extract-audio --audio-format mp3 --audio-quality 0';
    } else {
        // For video: get best mp4 combo and merge
        cmd += ' -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"';
        cmd += ' --merge-output-format mp4';
    }

    console.log(`[EXEC] ${cmd}`);

    // Increase timeout for large files
    exec(cmd, { maxBuffer: 1024 * 1024 * 100, timeout: 600000 }, (error: any, stdout: any, stderr: any) => {
        console.log(`[STDOUT] ${stdout}`);

        if (error) {
            console.error(`[EXEC_ERROR] ${error.message}`);
            console.error(`[STDERR] ${stderr}`);
            return res.status(500).json({ error: 'Download failed', details: stderr || error.message });
        }

        console.log(`[DOWNLOAD_COMPLETE]`);

        // Find the actual output file
        // yt-dlp may have created it with a slightly different name
        const files = fs.readdirSync(downloadsDir);
        console.log(`[FILES_IN_DIR] ${files.join(', ')}`);

        // Look for our file or any file containing the timestamp
        let actualFile = files.find((f: string) => f === filename);

        if (!actualFile) {
            // Try to find a file with our timestamp and the right extension
            actualFile = files.find((f: string) =>
                f.includes(timestamp.toString()) && f.endsWith(`.${extension}`)
            );
        }

        if (!actualFile) {
            // Last resort: find any recently created file with correct extension
            actualFile = files
                .filter((f: string) => f.endsWith(`.${extension}`))
                .sort((a: string, b: string) => {
                    const statA = fs.statSync(path.join(downloadsDir, a));
                    const statB = fs.statSync(path.join(downloadsDir, b));
                    return statB.mtimeMs - statA.mtimeMs;
                })[0];
        }

        if (!actualFile) {
            console.error('[FILE_MISSING] Output file not found');
            console.error(`[EXPECTED] ${filename}`);
            console.error(`[AVAILABLE] ${files.join(', ')}`);
            return res.status(500).json({ error: 'File generation failed - output not found' });
        }

        const finalPath = path.join(downloadsDir, actualFile);
        console.log(`[SENDING_FILE] ${finalPath}`);

        // Check file size
        const stats = fs.statSync(finalPath);
        console.log(`[FILE_SIZE] ${stats.size} bytes`);

        if (stats.size === 0) {
            return res.status(500).json({ error: 'Generated file is empty' });
        }

        // Set explicit headers
        const mimeType = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);

        // Stream the file
        const fileStream = fs.createReadStream(finalPath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            console.log('[STREAM_COMPLETE]');
            cleanup(finalPath);
        });

        fileStream.on('error', (err: any) => {
            console.error('[STREAM_ERROR]', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'File streaming failed' });
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
