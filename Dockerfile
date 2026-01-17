
# Use Node.js base image
FROM node:18-bullseye-slim

# Install Python and FFmpeg (Required for yt-dlp)
RUN apt-get update && \
    apt-get install -y python3 python3-pip python-is-python3 ffmpeg && \
    apt-get clean && \
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
# We use npx tsc to compile specifically the server if needed, or rely on ts-node if we wanted, 
# but for stability we will compile it. 
# Let's use a simple tsc command to compile everything including the server.
RUN npx tsc --project tsconfig.json

# Expose port
EXPOSE 3000

# Start the application using pure Node (lighter than ts-node)
# Ensure we point to the compiled server file. 
# Based on standard tsc output, it usually goes to 'dist' or same folder depending on config.
# Let's assume standard behavior or force it.
# IMPORTANT: We need to make sure server.js exists. 
# Let's use ts-node for now as it is safer if we don't know exact tsconfig output, 
# BUT we will increase memory limit node args if possible, or just retry. 
# Actually, the error might be memory. 
# Let's Stick to ts-node but ADD --transpile-only to save massive memory/cpu
CMD ["npx", "ts-node", "--transpile-only", "server/server.ts"]
