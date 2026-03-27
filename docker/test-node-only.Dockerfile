FROM node:22

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    libx11-dev \
    libxkbfile-dev \
    && rm -rf /var/lib/apt/lists/*

# System node only - no fnm, no nvm
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
# Install editor dependencies (required for launch-editor.sh)
RUN cd apps/editor && npm ci
CMD ["bash", "-c", "source ./scripts/activate_env.sh && ./launch-editor.sh --version-check"]