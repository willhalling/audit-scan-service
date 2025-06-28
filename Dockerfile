# Use Node.js base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install dependencies and Chromium (headless-compatible)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=8080
ENV FIREBASE_SERVICE_ACCOUNT=""
# FIREBASE_SERVICE_ACCOUNT will be set at runtime via Cloud Run environment variables


# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install --include=dev

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove devDependencies for production
RUN npm prune --production

# Expose the port Cloud Run expects
EXPOSE 8080

# Start the app
CMD ["node", "dist/index.js"]
