FROM node:20-slim

WORKDIR /app

# Install dependencies for Puppeteer, Canvas, and Sharp
RUN apt-get update && apt-get install -y \
    chromium \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    build-essential \
    python3 \
    make \
    g++ \
    libpng-dev \
    libwebp-dev \
    libtiff-dev \
    libheif-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV CHROME_PATH=/usr/bin/chromium
ENV PORT=8080
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev) for build
RUN npm install --include=dev

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Test the build
RUN ls -la dist/

# Remove devDependencies for production
RUN npm prune --production

EXPOSE 8080

# Add health check script
COPY healthcheck.js ./

# Use proper JSON form for CMD (recommended by Docker)
CMD ["node", "dist/index.js"]
