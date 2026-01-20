
# Use Node.js base image (Bookworm has Python 3.11, required by yt-dlp)
FROM node:20-bookworm-slim

# Install Python, FFmpeg, curl, and yt-dlp (nightly build for latest YouTube fixes)
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg curl unzip && \
    pip3 install --break-system-packages yt-dlp && \
    yt-dlp -U --update-to nightly && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify ffmpeg installation
RUN ffmpeg -version && yt-dlp --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for building)
RUN npm install

# Copy source code
COPY . .

# Create downloads directory with full permissions
RUN mkdir -p /app/dist/downloads && chmod -R 777 /app/dist/downloads

# Build the Next.js app
RUN npm run build

# Compile the custom server (server.ts -> dist/server.js)
RUN npx tsc --project tsconfig.server.json

# Set production environment for runtime
ENV NODE_ENV=production

# Environment variables for 2026 method (set these in Render dashboard)
# ENV COOKIES_FILE=/app/cookies.txt
# ENV PO_TOKEN=your_po_token_here
# ENV VISITOR_DATA=your_visitor_data_here

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/server.js"]
