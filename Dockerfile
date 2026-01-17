
# Use Node.js base image
FROM node:20-bullseye-slim

# Install Python and FFmpeg (Required for yt-dlp)
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg && \
    apt-get clean && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

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

# Expose port
EXPOSE 3000

# Start the application using pure Node (lighter than ts-node)
CMD ["node", "dist/server.js"]
