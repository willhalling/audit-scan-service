# RunPod Serverless image for the audit scan service.
#
# RunPod's Python SDK (handler.py) handles the job queue and forwards each job
# to the Node.js Express server running inside the same container. The Node.js
# server exposes /health, /run and the regular /audit, /lighthouse, /screenshot
# routes.
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install Python + pip so we can run the RunPod SDK wrapper, plus the system
# dependencies needed by Google Chrome.
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ca-certificates \
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
    python3 \
    python3-pip \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install Google Chrome directly
RUN curl -sSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# Environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Install dumb-init for proper signal handling and zombie reaping
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

# Verify Google Chrome installation
RUN google-chrome-stable --version && \
    ls -la /usr/bin/google-chrome-stable

# Copy package files and build the Node.js app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build
RUN npm prune --production

# Install RunPod Python SDK
COPY requirements-runpod.txt ./
RUN python3 -m pip install --no-cache-dir --upgrade pip && \
    python3 -m pip install --no-cache-dir -r requirements-runpod.txt

# Sanity check: confirm runpod SDK and Node.js server are present
RUN python3 -c "import runpod, requests; print('runpod', runpod.__version__ if hasattr(runpod, '__version__') else 'installed')" && \
    node -e "console.log('node', process.version)" && \
    ls -la dist/index.js

# Expose the port the Node.js server listens on. RunPod does not need this
# exposed for queue-based workers, but it is useful for local testing.
EXPOSE 8080

# Start the RunPod SDK handler, which in turn starts the Node.js server.
ENTRYPOINT ["dumb-init", "--"]
CMD ["python3", "-u", "handler.py"]
