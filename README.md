# Video Link Downloader

A modern web application to download videos from YouTube, Instagram, and TikTok.

## Features

- 🎬 Download videos from YouTube, Instagram, and TikTok
- 🎵 Extract audio as MP3
- 📱 Mobile-friendly responsive design
- 🚀 Deployed on Render with Docker

## 2026 YouTube Method

This application uses the "2026 method" for YouTube downloads, which bypasses common restrictions:

### Environment Variables

Set these in your Render dashboard (or `.env` file for local development):

| Variable | Description |
|----------|-------------|
| `COOKIES_FILE` | Path to your YouTube cookies file (default: `/app/cookies.txt`) |
| `PO_TOKEN` | YouTube PO-Token for authentication bypass |
| `VISITOR_DATA` | YouTube Visitor Data for session persistence |

### How to Get YouTube Cookies

1. Install a browser extension like "Get cookies.txt LOCALLY"
2. Log in to YouTube in your browser
3. Export cookies to `cookies.txt`
4. Upload the file to your server

### How to Get PO-Token and Visitor Data

1. Open YouTube in your browser
2. Open Developer Tools (F12)
3. Go to Network tab
4. Play a video and look for requests to `youtubei/v1/player`
5. Find `po_token` and `visitor_data` in the request payload

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Deployment to Render

1. Push code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Set Runtime to "Docker"
5. Add environment variables (COOKIES_FILE, PO_TOKEN, VISITOR_DATA)
6. Deploy!

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript
- **Backend**: Express.js, Node.js
- **Video Processing**: yt-dlp, FFmpeg
- **Deployment**: Docker, Render

## File Structure

```
├── app/                 # Next.js frontend
├── server/
│   └── server.ts        # Express backend with yt-dlp integration
├── Dockerfile           # Docker configuration
├── tsconfig.server.json # TypeScript config for server
└── cookies.txt          # YouTube cookies (not in git)
```

## Troubleshooting

### YouTube downloads fail with 403 error

1. Ensure you have a valid `cookies.txt` file
2. Set `PO_TOKEN` and `VISITOR_DATA` environment variables
3. The application uses yt-dlp nightly builds for latest fixes

### Videos have no audio

The application automatically downloads video and audio separately and merges them using FFmpeg.

### Memory issues on Render

The free tier has 512MB RAM limit. If you encounter memory issues:
1. Reduce video quality in download options
2. Upgrade to a paid Render plan

## License

MIT
