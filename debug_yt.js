const ytDlp = require('yt-dlp-exec');

const url = 'https://www.tiktok.com/@khaby.lame/video/7086819445831552262'; // TikTok URL

console.log('Testing yt-dlp for:', url);

ytDlp(url, {
    dumpJson: true,
    noWarnings: true,
    noCallHome: true,
    preferFreeFormats: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
}).then(output => {
    console.log('Success!');
    console.log('Title:', output.title);
}).catch(err => {
    console.error('Error fetching metadata:');
    console.error(err);
});
