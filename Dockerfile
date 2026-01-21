
# Use Node.js base image (Bookworm has Python 3.11)
FROM node:20-bookworm-slim

# Install Python, FFmpeg, and download engines
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg curl unzip && \
    pip3 install --break-system-packages pytubefix yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify installations
RUN echo "=== Checking installations ===" && \
    ffmpeg -version | head -1 && \
    python -c "import pytubefix; print(f'pytubefix version: {pytubefix.__version__}')" && \
    yt-dlp --version && \
    python --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create directories with permissions
RUN mkdir -p /app/dist/downloads && chmod -R 777 /app/dist/downloads
RUN mkdir -p /app/scripts && chmod -R 755 /app/scripts

# Build the Next.js app
RUN npm run build

# Compile the custom server
RUN npx tsc --project tsconfig.server.json

# Ensure downloads directory permissions after build
RUN mkdir -p /app/dist/downloads && chmod -R 777 /app/dist/downloads

# Copy Python scripts to dist
RUN cp -r /app/scripts /app/dist/scripts 2>/dev/null || true

# Set production environment
ENV NODE_ENV=production

# Environment variables (set in Render/Oracle dashboard)
# ENV COOKIES_FILE=/app/cookies.txt
# ENV PO_TOKEN=your_po_token_here
# ENV VISITOR_DATA=your_visitor_data_here

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/server.js"]
