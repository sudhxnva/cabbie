FROM node:20-slim

# Install dependencies needed for the app
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create necessary directories
RUN mkdir -p /app/screenshots /app/memory

# Expose the application port
EXPOSE 3000

# Set non-root user for security
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Default command
CMD ["node", "dist/server.js"]
