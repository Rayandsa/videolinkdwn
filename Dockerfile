
# Use Node.js base image (Bookworm has Python 3.11)
FROM node:20-bookworm-slim

# Install Python, FFmpeg, and Python packages
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg && \
    pip3 install --break-system-packages pytubefix requests && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify installations
RUN echo "=== Installation Check ===" && \
    python --version && \
    python -c "from pytubefix import YouTube; print('pytubefix OK')" && \
    ffmpeg -version | head -1

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy ALL source code (including downloader.py at root)
COPY . .

# Create directories with permissions
RUN mkdir -p /app/dist/downloads && chmod -R 777 /app/dist/downloads
RUN mkdir -p /app/__cache__ && chmod -R 777 /app/__cache__

# Build Next.js
RUN npm run build

# Compile TypeScript server
RUN npx tsc --project tsconfig.server.json

# Ensure permissions after build
RUN chmod -R 777 /app/dist/downloads
RUN chmod -R 777 /app/__cache__
RUN chmod +x /app/downloader.py

# Production mode
ENV NODE_ENV=production

# OAuth token file location (pytubefix cache)
ENV OAUTH_TOKEN_FILE=/app/__cache__/tokens.json

EXPOSE 3000

CMD ["node", "dist/server.js"]
