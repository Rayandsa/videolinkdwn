
# Use Node.js base image (Bookworm has Python 3.11)
FROM node:20-bookworm-slim

# Install Python, FFmpeg, and pytubefix
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg && \
    pip3 install --break-system-packages pytubefix && \
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

# Create downloads directory with permissions
RUN mkdir -p /app/dist/downloads && chmod -R 777 /app/dist/downloads

# Build Next.js
RUN npm run build

# Compile TypeScript server
RUN npx tsc --project tsconfig.server.json

# Ensure permissions after build
RUN chmod -R 777 /app/dist/downloads
RUN chmod +x /app/downloader.py

# Production mode
ENV NODE_ENV=production

# Environment variables (set in dashboard)
# ENV PO_TOKEN=your_token
# ENV VISITOR_DATA=your_data

EXPOSE 3000

CMD ["node", "dist/server.js"]
