FROM node:20-slim

WORKDIR /app

# Install dependencies for Puppeteer and Canvas
RUN apt-get update && apt-get install -y \
    chromium \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV CHROME_PATH=/usr/bin/chromium
ENV PORT=8080
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install npm dependencies
RUN npm install

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
