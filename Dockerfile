FROM node:22-alpine

WORKDIR /app

# Install curl for container health checks
RUN apk add --no-cache curl

# Copy package files first for Docker layer caching
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application files
COPY index.html ./
COPY app.js ./
COPY server.js ./
COPY assets ./assets

# Production environment
ENV NODE_ENV=production
ENV PORT=3000

# Application port
EXPOSE 3000

# Container health check
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD curl --fail http://127.0.0.1:3000/health || exit 1

# Start application
CMD ["node", "server.js"]
