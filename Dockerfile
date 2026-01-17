
# Use Node.js base image (Bookworm has Python 3.11, required by yt-dlp)
FROM node:20-bookworm-slim

# Install Python, FFmpeg, curl, and yt-dlp (nightly build for latest YouTube fixes)
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg curl unzip && \
    pip3 install --break-system-packages yt-dlp && \
    yt-dlp -U --update-to nightly && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app


# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for building)
RUN npm install

# Copy source code
COPY . .

# Build the Next.js app
RUN npm run build

# Compile the custom server (server.ts -> dist/server/server.js)
RUN npx tsc --project tsconfig.server.json

# Set production environment for runtime (AFTER build to keep devDependencies during build)
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the application using pure Node (lighter than ts-node)
CMD ["node", "dist/server.js"]
