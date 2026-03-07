# Cabbie — Claude Code Instructions

## Task Tracking

**All tasks and remaining work are tracked as GitHub Issues:**
https://github.com/sudhxnva/cabbie/issues

Before starting any work, check open issues. When implementing a feature, reference the issue number in commits. Use `gh issue list` to see current state.

| # | Title | Slice |
|---|-------|-------|
| [#1](https://github.com/sudhxnva/cabbie/issues/1) | Verify ADB MCP server works with emulator serial targeting | 1 |
| [#2](https://github.com/sudhxnva/cabbie/issues/2) | Create AVD snapshots for Uber and Lyft | 1 |
| [#3](https://github.com/sudhxnva/cabbie/issues/3) | End-to-end test of single emulator agentic loop | 1 |
| [#4](https://github.com/sudhxnva/cabbie/issues/4) | Two parallel emulators with no cross-device contamination | 2 |
| [#5](https://github.com/sudhxnva/cabbie/issues/5) | Backend HTTP API (POST /booking/request, POST /booking/confirm, GET /health) | 3 |
| [#6](https://github.com/sudhxnva/cabbie/issues/6) | MongoDB integration: replace hardcoded config | 3 |
| [#7](https://github.com/sudhxnva/cabbie/issues/7) | Booking completion flow: sub-agent books confirmed option | 5 |
| [#8](https://github.com/sudhxnva/cabbie/issues/8) | Memory file update: sub-agent appends navigation notes after each run | 5 |
| [#9](https://github.com/sudhxnva/cabbie/issues/9) | Docker setup for Vultr deployment | infra |
| [#10](https://github.com/sudhxnva/cabbie/issues/10) | ElevenLabs voice interface integration | 4 |

---

## Project Overview

Cabbie is a voice-controlled cab price comparison and booking system for a hackathon. It uses Android emulators controlled by Claude Code sub-agents to navigate multiple cab apps simultaneously, compare prices, and book the best option based on user constraints.

## Build Goal (Demo-First)

Start from the working demo end: emulators launch → Claude Code is invoked → sub-agents navigate apps → prices aggregated → ranked results printed. No HTTP server, no voice yet.

## Tech Stack

- **Language**: TypeScript (Node.js), run with `tsx`
- **Agent**: `@anthropic-ai/claude-code` SDK — `query()` function (no CLI subprocess)
- **Device control**: ADB MCP server for Android emulator interaction
- **Data**: Hardcoded configs (simulating MongoDB) for the demo

## Directory Structure

```
cabbie/
├── src/
│   ├── index.ts              # Entry point — emulator launch + parallel SDK queries
│   ├── types.ts              # BookingRequest, AppConfig, PriceResult types
│   ├── emulator.ts           # ADB wrappers: restoreSnapshot, launchApp, waitForBoot
│   └── claude.ts             # Build prompts, run SDK query(), aggregate results
├── prompts/
│   └── sub-agent.md          # Sub-agent prompt template (per-app navigation)
├── memory/
│   ├── uber.md               # Per-app navigation memory (starts empty)
│   └── lyft.md
├── screenshots/              # Agents save screenshots here per step
├── config/
│   └── hardcoded.ts          # Simulated MongoDB data + hardcoded BookingRequest
├── package.json
└── tsconfig.json
```

## Core Data Contracts

### BookingRequest
```typescript
{
  userId: string
  pickup: { address: string }
  dropoff: { address: string }
  passengers?: number
  constraints: {
    priority: 'cheapest' | 'fastest' | 'comfortable' | 'luxury' | 'eco' | 'free'
    specificApp?: string
    maxPrice?: number
    maxWaitMinutes?: number
  }
}
```

### AppConfig
```typescript
{
  appName: string
  appId: string          // android package name e.g. "com.ubercab"
  emulatorSerial: string // e.g. "emulator-5554"
  snapshotName: string   // AVD snapshot to restore before each run
  notes: string
  memoryFilePath: string // path to this app's navigation memory file
}
```

### PriceResult
```typescript
{
  appName: string
  success: boolean
  error?: string
  options: {
    name: string         // "UberX", "Lyft Standard"
    price: string        // keep as string, OCR may return ranges like "$12-14"
    priceMin?: number
    etaMinutes: number
    category: 'standard' | 'comfort' | 'xl' | 'luxury' | 'eco' | 'free'
  }[]
}
```

## Implementation Plan

### Phase 1: Project Setup
- `npm init -y`, install `typescript tsx @types/node`
- `tsconfig.json` with `"target": "ES2022"`, `"module": "CommonJS"`, `"strict": true`
- Script: `"dev": "tsx src/index.ts"`

### Phase 2: Hardcoded Config (`config/hardcoded.ts`)
Simulate MongoDB + frontend input:
- `HARDCODED_USER`: demo user
- `HARDCODED_APP_CONFIGS`: 2 apps (Uber on emulator-5554, Lyft on emulator-5556)
- `HARDCODED_BOOKING_REQUEST`: cheapest cab from hardcoded pickup → dropoff

### Phase 3: Emulator Manager (`src/emulator.ts`)
ADB command wrappers using `child_process.execSync`:
- `restoreSnapshot(serial, snapshot)` — `adb -s <serial> emu avd snapshot load <snapshot>`
- `launchApp(serial, appId)` — `adb -s <serial> shell monkey -p <appId> -c android.intent.category.LAUNCHER 1`
- `waitForBoot(serial)` — poll `adb -s <serial> shell getprop sys.boot_completed` until "1"

### Phase 4: Prompts

#### `prompts/sub-agent.md` (template)
- Device serial is `{{EMULATOR_SERIAL}}` — target exclusively, never another device
- **Always take a screenshot first before any action**
- Phase sequence: screenshot → locate pickup → enter `{{PICKUP}}` → enter `{{DROPOFF}}` → confirm → read price list
- Output is captured via SDK `output_format` JSON schema — no prose, no wrapper tags needed
- Save screenshots to `screenshots/{{APP_NAME}}-<step>.png` at each phase
- On failure: `{ appName, success: false, error: "...", options: [] }`

> No `main-agent.md` needed — Node.js is the orchestrator.

### Phase 5: Claude SDK Invoker (`src/claude.ts`)
- `buildSubAgentPrompt(app, request)` — load sub-agent template, fill placeholders + inject memory file content
- `runSubAgent(app, request)` — call SDK `query()` with:
  - `permission_mode: 'bypassPermissions'`
  - `mcp_servers: { adb: { type: 'stdio', command: 'npx', args: ['-y', 'android-adb-mcp'] } }`
  - `allowed_tools: ['mcp__adb__*', 'Read', 'Write']`
  - `output_format: { type: 'json_schema', schema: PriceResultSchema }`
  - `max_turns: 30`, `max_budget_usd: 0.50`
- Collect `ResultMessage` from the async generator, return typed `PriceResult`
- `rankResults(results, constraint)` — sort by priority in Node.js (no agent needed)

```typescript
// Parallel sub-agents — Node.js is the orchestrator
const results = await Promise.all(
  apps.map(app => runSubAgent(app, request))
)
```

### Phase 6: Entry Point (`src/index.ts`)
```typescript
1. Load hardcoded configs
2. Restore emulator snapshots + wait for boot
3. Launch cab apps
4. Sleep 5s for app home screens to load
5. Run sub-agents in parallel via Promise.all
6. Rank results in Node.js
7. Print ranked results
```

## ADB MCP Configuration

The ADB MCP server is configured **per-query** in the SDK options — no global `~/.claude.json` changes needed:

```typescript
mcp_servers: {
  adb: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'android-adb-mcp']
  }
}
```

Verify exact package name (`android-adb-mcp`) before implementation — check npm for the correct package.

## Smoke Test Before Full Run
```bash
adb devices                                              # both serials visible
adb -s emulator-5554 shell getprop sys.boot_completed   # should print "1"
npx -y android-adb-mcp --help                           # verify MCP package works
```

## Key Rules
- Every ADB command in prompts must include `-s <serial>` — no exceptions
- `screenshots/` directory must exist before agents run
- Budget cap: `max_budget_usd: 0.50` per sub-agent, `max_turns: 30`
- Sub-agent prompts must include memory file content (even if empty)
- Output is structured via `output_format` JSON schema — no `<RESULTS>` tags needed
- Node.js ranks results after `Promise.all` resolves — agents do not rank
