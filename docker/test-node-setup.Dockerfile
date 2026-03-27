FROM ubuntu:22.04

# Install dependencies needed for nvm, Node.js, and native modules
RUN apt-get update && apt-get install -y \
    curl wget git \
    build-essential \
    python3 \
    libx11-dev \
    libxkbfile-dev

# Install nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Add nvm to path
ENV NVM_DIR="/root/.nvm"
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc && \
    echo '[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"' >> ~/.bashrc

# Create project directory
WORKDIR /app

# Copy package.json to leverage layer caching
COPY package*.json ./
RUN source ~/.bashrc && npm ci --ignore-scripts

# Copy rest of project
COPY . .

# Install editor dependencies (required for launch-editor.sh)
RUN cd apps/editor && source ~/.bashrc && npm ci

# Entrypoint to run launch-editor.sh with setup and run
CMD ["bash", "-c", "source ~/.bashrc && source ./scripts/activate_env.sh && ./launch-editor.sh --setup-and-run"]