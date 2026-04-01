# OCCode Setup Guide

This guide covers both Docker and Local installation methods.

## System Requirements

- **OS**: Windows 10/11, macOS 11+, or Linux (Ubuntu 20.04+)
- **RAM**: 4 GB minimum (8 GB recommended)
- **Disk**: 5 GB free space (10+ GB for Docker images)
- **Network**: Internet connection for initial download

## Docker Setup (Recommended)

### Prerequisites

- **Docker Desktop** (Windows/macOS) or **Docker Engine** (Linux) with Docker Compose v2.
- Docker must be running before starting OCCode.

### Steps

1. Launch OCCode. On first run, the Setup Wizard appears.
2. Choose **Docker Setup**.
3. Select data directory (default: `~/Desktop/occ/.openclaw`). A desktop shortcut will be created.
4. The wizard checks your Docker environment (CLI, daemon, ports, compose).
   - If Docker is missing, follow the on-screen instructions to install.
5. Click **Start Docker Environment**. OCCode pulls required images and starts:
   - `openclaw-gateway` (port 18789)
   - `postgres` (port 5432)
   - `redis` (port 6379)
6. Wait for health checks to pass (gateway `/health` returns 200).
7. Configuration is written to `~/.openclaw/openclaw.json`.
8. You are redirected to the Dashboard. Setup complete!

### Common Docker Issues

- **Docker daemon not running**: Start Docker Desktop (Windows/macOS) or `sudo systemctl start docker` (Linux).
- **Port 18789 in use**: Another OpenClaw instance may be running. Use `docker ps` to check; stop old containers or change port in advanced config.
- **Image pull slow**: First pull may take several minutes depending on internet speed. Subsequent starts are faster.
- **Permission denied (Linux)**: Add your user to `docker` group: `sudo usermod -aG docker $USER`, then log out/in.

## Local Setup (Advanced)

Local Setup installs OpenClaw CLI and configures services directly on your machine. It is intended for developers comfortable with terminal workflows.

### Steps

1. In the Setup Wizard, choose **Local Setup**.
2. Follow the four steps in order:

   **Step 1: Install OpenClaw CLI**
   - Runs `npm install -g @openclaw/cli`.
   - May require administrator/sudo rights. If it fails, install manually and return.

   **Step 2: Start Database**
   - Attempts to start PostgreSQL and create the `openclaw` database.
   - On Linux/macOS this may require `sudo`. Ensure PostgreSQL is installed (`brew install postgresql` or `sudo apt install postgresql`).

   **Step 3: Run Backend**
   - Clones the OpenClaw backend repository to `~/.openclaw/backend` (if not present).
   - You will need to start it manually: `cd ~/.openclaw/backend && npm install && npm run dev`.
   - Ensure `DATABASE_URL` and `JWT_SECRET` are set in `.env`.

   **Step 4: Launch Editor**
   - This step is informational — the OCcode editor is already running. You may switch to it to continue.

3. After all steps report **Completed** (or some skipped), click **Go to Dashboard**.
4. The extension tries to connect to the gateway at `http://127.0.0.1:18789`. Make sure the gateway is running (`openclaw gateway status`).

### Manual Alternative

If the automated steps fail, refer to the full developer guide: [Developer Quickstart](../ticket-020-developer-quickstart/README.md) (or `DEVELOPERS.md` in the repository).

### Troubleshooting

- **CLI install fails**: Ensure Node.js 20.18.2 is installed (`node -v`). Use `nvm use` if needed.
- **Database not starting**: Verify PostgreSQL is installed and running: `pg_isready`. On Linux: `sudo systemctl status postgresql`.
- **Backend not reachable**: Start it manually and check port 3001 is free: `lsof -i :3001`.
- **Gateway not running**: `openclaw gateway start`. If it fails, check logs: `openclaw gateway logs`.

## Reset or Re-run Setup

To reset the setup (e.g., switch from Local to Docker):

1. Open the command palette (Ctrl+Shift+P / Cmd+Shift+P).
2. Run `occ.setup.reset`.
3. Confirm; this tears down Docker containers, removes `~/.openclaw/openclaw.json`, and restarts the wizard.

For a full factory reset (deletes all data and Docker volumes), use `occ.setup.reset` with the **Reset Everything** option in the wizard.

## Still Stuck?

- Check the log file: `~/.openclaw/occ-home.log`
- Open an issue on [GitHub](https://github.com/damoahdominic/occ/issues)
- Ask in the [Discord community](https://discord.gg/Ybn2hW8yrt)
