FROM node:22

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    libx11-dev \
    libxkbfile-dev \
    && rm -rf /var/lib/apt/lists/*

# Install fnm
RUN curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local

# Add fnm to path for this layer
ENV PATH="/root/.local/bin:${PATH}"

# Create project directory
WORKDIR /app

# Copy package.json to leverage layer caching
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy rest of project
COPY . .

# Install editor dependencies (required for launch-editor.sh)
RUN cd apps/editor && npm ci

# Entrypoint to test launch-editor.sh with version detection
CMD ["bash", "-c", "source ./scripts/activate_env.sh && ./launch-editor.sh --version-check"]