FROM node:20-slim

WORKDIR /app

# Install dependencies including system Chromium for Cloud Run compatibility
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
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libnss3-dev \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libxss1 \
    libgconf-2-4 \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROME_DISABLE_DEV_SHM_USAGE=true
ENV CHROME_NO_SANDBOX=true
ENV FIREBASE_SERVICE_ACCOUNT=""
# FIREBASE_SERVICE_ACCOUNT will be set at runtime via Cloud Run environment variables

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev) for build
RUN npm install --include=dev

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Test system Chromium installation
RUN ls -la /usr/bin/chromium && chromium --version || echo "Chromium not found at /usr/bin/chromium"

# Test the build
RUN ls -la dist/

# Remove devDependencies for production
RUN npm prune --production

# Set Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 8080

# Add health check script
COPY healthcheck.js ./

# Use proper JSON form for CMD (recommended by Docker)
CMD ["node", "dist/index.js"]
