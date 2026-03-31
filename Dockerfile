# Use Node.js 20 LTS as base image
FROM node:20-alpine

# Install build dependencies and Python for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose development port
EXPOSE 3000

# Set environment to development
ENV NODE_ENV=development

# Default command (will be overridden by compose)
CMD ["npm", "run", "dev"]