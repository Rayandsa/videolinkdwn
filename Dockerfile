
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

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Build the Next.js app
RUN npm run build

# Expose port (Render sets PORT env, but good to document)
EXPOSE 3000

# Start the application using our custom server
CMD ["npm", "run", "start"]
