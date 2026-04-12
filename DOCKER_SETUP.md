# Docker Setup Guide

**For comprehensive Docker documentation, see [DOCKER.md](./DOCKER.md)**

## Quick Start

### Development Environment (Editor + Web)

```bash
# Start editor and web services
docker-compose up -d

# View logs
docker-compose logs -f editor

# Stop
docker-compose down
```

Editor runs on `http://localhost:9888` (healthcheck ~9 min cold start)  
Web service runs on `http://localhost:3002`

See **DOCKER.md** for detailed instructions on all Docker services.
