
# Node.js + Python (Bookworm = Python 3.11)
FROM node:20-bookworm-slim

# Install Python, FFmpeg, pytubefix, and yt-dlp
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg && \
    pip3 install --break-system-packages pytubefix yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify installations
RUN echo "=== Verification ===" && \
    python --version && \
    python -c "from pytubefix import YouTube; print('pytubefix: OK')" && \
    yt-dlp --version && \
    ffmpeg -version | head -1

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Create downloads directory
RUN mkdir -p /app/dist/downloads && chmod -R 777 /app/dist/downloads

# Build Next.js
RUN npm run build

# Compile TypeScript
RUN npx tsc --project tsconfig.server.json

# Permissions
RUN chmod +x /app/downloader.py
RUN chmod -R 777 /app/dist/downloads

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server.js"]
