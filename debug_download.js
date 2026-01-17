const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

// Path to the installed yt-dlp binary
const YT_DLP_PATH = 'C:\\Users\\cliff\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const url = 'https://www.instagram.com/reel/DTYq4i8kagH/';
const format = 'mp3'; // Testing audio download

const tempId = 'debug_test_' + Date.now();
const tempDir = path.join(__dirname, 'server', 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const outputTemplate = path.join(tempDir, `${tempId}.%(ext)s`);

console.log('Testing download generation...');
console.log('Output Template:', outputTemplate);
console.log('FFmpeg Path:', ffmpegPath);

const args = [
    url,
    '--output', outputTemplate,
    '--no-warnings',
    '--prefer-free-formats',
    '--user-agent', USER_AGENT,
    '--ffmpeg-location', ffmpegPath,
    '--no-playlist'
];

if (format === 'mp3') {
    args.push('--extract-audio', '--audio-format', 'mp3');
} else {
    args.push(
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4'
    );
}

const process = spawn(YT_DLP_PATH, args);

process.stdout.on('data', (data) => console.log('stdout:', data.toString()));
process.stderr.on('data', (data) => console.log('stderr:', data.toString()));

process.on('close', (code) => {
    console.log('Process exited with code:', code);

    if (code === 0) {
        const files = fs.readdirSync(tempDir);
        const generatedFile = files.find(f => f.startsWith(tempId));
        console.log('Found generated file:', generatedFile);

        if (generatedFile) {
            const stats = fs.statSync(path.join(tempDir, generatedFile));
            console.log('File size:', stats.size);
        }
    }
});
