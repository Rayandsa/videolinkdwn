
# Use Node.js base image
FROM node:18-bullseye-slim

# Install Python and FFmpeg (Required for yt-dlp)
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Build the Next.js app AND the server
# We compile server.ts to dist/server.js using tsc (or just rely on ts-node if we must, but node is better)
# Let's keep it simple: We will use ts-node in the Dockerfile for now but ensure it works by installing dev dependencies.
# The previous error "Not Found" often means Next.js app didn't prepare correctly.

# Ensure we keep devDependencies for ts-node usage or build
RUN npm install

# Copy the rest of the app
COPY . .

# Build the Next.js app
RUN npm run build

# Start the application using our custom server
CMD ["npm", "run", "start"]
