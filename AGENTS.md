# AGENTS.md - Cabbie Development Guide

## Project Overview

Cabbie is an AI-powered cab price comparison and booking system that uses Android emulators controlled by Claude Code sub-agents to navigate cab apps (Uber, Lyft, CU Night Ride), compare prices, and optionally book rides.

## Docker Configuration

### Files Created

- **Dockerfile** - Node.js 20 container with production dependencies
- **docker-compose.yml** - Multi-container setup with MongoDB and app services
- **src/config.ts** - Centralized configuration loading from environment variables

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required) | - |
| `MONGODB_URI` | MongoDB connection string | `mongodb://mongodb:27017/cabbie` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `production` |
| `EMULATOR_MODE` | `local` or `remote` | `local` |
| `ANDROID_SDK_HOST_PATH` | Host path to Android SDK | `~/Android/Sdk` |
| `EMULATOR_SERIALS` | Comma-separated emulator serials | `emulator-5554,emulator-5556` |
| `MCP_SERVER_COMMAND` | MCP server command | `npx` |
| `MCP_SERVER_ARGS` | MCP server args | `-y adb-mcp` |
| `DEBUG` | Show emulator windows | `false` |

### Running with Docker

```bash
# Local emulator mode
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
docker compose up --build -d

# Test health endpoint
curl http://localhost:3000/health

# Seed database
docker compose exec app npm run seed
```

## Key Implementation Details

### MCP Server Configuration

The MCP server configuration is now environment-based in `src/claude.ts`:
- Uses `MCP_SERVER_COMMAND` (default: `npx`)
- Uses `MCP_SERVER_ARGS` (default: `-y adb-mcp`)
- Optionally uses `ANDROID_MCP_DIRECTORY` for uv-based MCP server

### Emulator Configuration

The emulator binary path is configurable in `src/emulator.ts`:
- Priority: `EMULATOR_BINARY_PATH` > `ANDROID_HOME` > default path

### Database

- MongoDB connection uses `MONGODB_URI` (supports `MONGO_URI` for backward compatibility)
- Seed script at `seed.ts` creates demo user and app configurations

## Build Commands

```bash
npm run build    # Compile TypeScript to dist/
npm run start   # Run compiled server
npm run dev     # Run with tsx (development)
npm run server  # Run HTTP server with tsx
npm run seed    # Seed database with demo data
```
