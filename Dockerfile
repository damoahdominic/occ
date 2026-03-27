# Use Node.js LTS as base image
FROM node:18-alpine

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