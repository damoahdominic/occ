# OCcode Docker & Test Infrastructure

## Overview

This project includes comprehensive Docker setup and Node.js version detection testing infrastructure.

## Structure

### Docker Compose Files

#### `docker-compose.test.yml` - Test Environment
Defines isolated test services for various Node.js runtime scenarios:

- **test-fnm**: FNM (Fast Node Manager) scenario
- **test-nvm**: NVM (Node Version Manager) scenario  
- **test-node-only**: System Node without version managers
- **test-node-setup**: Auto-install scenario from base Ubuntu

Each service has:
- Isolated node_modules volume
- Proper environment configuration
- Build from custom Dockerfiles with required system dependencies

#### `docker-compose.yml` - Development Environment
Main development environment for running OCcode editor.

### Dockerfiles

Located in `docker/` directory:

- `test-fnm.Dockerfile`: FNM + Node development environment
- `test-nvm.Dockerfile`: NVM + Node development environment
- `test-node-only.Dockerfile`: System Node only
- `test-node-setup.Dockerfile`: Ubuntu base with NVM auto-install

All Dockerfiles include system dependencies:
- `build-essential` - Compiler toolchain
- `libx11-dev`, `libxkbfile-dev` - For native module compilation (native-keymap, etc.)

### Scripts

#### `scripts/test-node-version-detection.sh`
Comprehensive test runner for all Node.js scenarios.

**Tests:**
- fnm scenario: Verifies FNM installation and availability
- nvm scenario: Verifies NVM installation and availability
- node-only: Verifies system Node works
- node-setup: Verifies auto-install from clean Ubuntu

**Usage:**
```bash
make test                    # Run all tests via Makefile
bash scripts/test-node-version-detection.sh  # Run directly
```

#### `scripts/node-version.sh`
Shared Node.js version detection and activation logic.

Priority order:
1. Docker environment → use system Node
2. fnm → install/use specified version
3. nvm → install/use specified version
4. System Node → if version matches
5. Auto-install nvm → fallback

#### `scripts/activate_env.sh`
Environment activation script for shell configuration.

## Usage

### Running Tests

```bash
# Run all tests
make test

# Run individual docker-compose tests
docker-compose -f docker-compose.test.yml run --rm test-fnm
docker-compose -f docker-compose.test.yml run --rm test-nvm
docker-compose -f docker-compose.test.yml run --rm test-node-only
docker-compose -f docker-compose.test.yml run --rm test-node-setup
```

### Development Environment

```bash
# Start development environment
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f editor

# Access container
docker-compose exec editor bash
```

## Makefile Targets

### Test Targets

- `make test` - Run all Node version detection tests
- `make docker-test` - Run all tests with docker-compose
- `make docker-test-fnm` - Test FNM scenario only
- `make docker-test-nvm` - Test NVM scenario only
- `make docker-test-node-only` - Test Node-only scenario
- `make docker-test-node-setup` - Test setup scenario

### Original Targets (Direct Docker)

- `make run-fnm` - Run FNM test with direct docker
- `make run-nvm` - Run NVM test with direct docker
- `make run-node-only` - Run Node-only test with direct docker
- `make run-node-setup` - Run setup test with direct docker

## Test Results

All 4 test scenarios pass successfully:
- ✓ fnm scenario - fnm 1.39.0 available
- ✓ nvm scenario - nvm 0.39.7 available
- ✓ Node only scenario - v22.22.2 detected
- ✓ Node setup scenario - v20.18.2 installed via auto-install

## Key Features

1. **Isolated Environments**: Each test runs in its own container with isolated volumes
2. **System Dependencies**: All Dockerfiles include required build tools and libraries
3. **Version Detection**: Sophisticated priority-based Node version detection
4. **Clean Test Scripts**: Test logic fixed to handle bash function returns properly
5. **Docker Optimization**: .dockerignore configured to reduce build context

## Troubleshooting

### Build Timeout
If docker-compose build times out, use:
```bash
DOCKER_BUILDKIT=0 docker-compose build
```

### Permission Issues
Ensure git safe.directory is configured:
```bash
git config --global safe.directory /path/to/occ
```

### Missing System Dependencies
Rebuild Dockerfiles to ensure xkbfile and other dev packages are installed:
```bash
docker-compose -f docker-compose.test.yml build --no-cache test-node-only
```
