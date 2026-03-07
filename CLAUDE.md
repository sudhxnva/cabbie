# Cabbie — Claude Code Instructions

## Project Overview

Cabbie is a voice-controlled cab price comparison and booking system for a hackathon. It uses Android emulators controlled by Claude Code sub-agents to navigate multiple cab apps simultaneously, compare prices, and book the best option based on user constraints.

## Build Goal (Demo-First)

Start from the working demo end: emulators launch → Claude Code is invoked → sub-agents navigate apps → prices aggregated → ranked results printed. No HTTP server, no voice yet.

## Tech Stack

- **Language**: TypeScript (Node.js), run with `tsx`
- **Agent**: Claude Code CLI (`claude --print --dangerously-skip-permissions`)
- **Device control**: ADB MCP server for Android emulator interaction
- **Data**: Hardcoded configs (simulating MongoDB) for the demo

## Directory Structure

```
cabbie/
├── src/
│   ├── index.ts              # Entry point — emulator launch + Claude invocation
│   ├── types.ts              # BookingRequest, AppConfig, PriceResult types
│   ├── emulator.ts           # ADB wrappers: restoreSnapshot, launchApp, waitForBoot
│   └── claude.ts             # Build prompts, invoke claude CLI, parse JSON output
├── prompts/
│   ├── main-agent.md         # Main Claude Code orchestrator prompt template
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
- Return ONLY valid PriceResult JSON, no prose
- Save screenshots to `screenshots/{{APP_NAME}}-<step>.png` at each phase
- On failure: `{ appName, success: false, error: "...", options: [] }`

#### `prompts/main-agent.md`
- Spawn one sub-agent per app using the Agent tool with filled sub-agent prompt
- Run sub-agents in parallel
- Aggregate all PriceResult JSONs
- Rank by constraint (cheapest = sort priceMin asc, fastest = sort etaMinutes asc)
- Wrap final output in `<RESULTS>...</RESULTS>` tags

### Phase 5: Claude Invoker (`src/claude.ts`)
- `buildMainPrompt(request, apps)` — load template, fill placeholders
- `buildSubAgentPrompt(app, request)` — load sub-agent template, fill all placeholders including memory file content
- `invokeClaudeCode(prompt)` — `spawnSync('claude', ['--print', '--dangerously-skip-permissions', '-p', prompt])`
- `parseResults(output)` — regex extract content between `<RESULTS>...</RESULTS>`, JSON.parse

### Phase 6: Entry Point (`src/index.ts`)
```typescript
1. Load hardcoded configs
2. Restore emulator snapshots + wait for boot
3. Launch cab apps
4. Sleep 5s for app home screens to load
5. Build main agent prompt
6. Invoke Claude Code
7. Parse + print ranked results
```

## Sub-agent Spawning Strategy

**Primary (Option A):** Node.js → single `claude` process → main-agent prompt → Claude uses Agent tool internally to spawn sub-agents.

**Fallback (Option B):** If Option A output parsing proves unreliable, switch to Node.js spawning N parallel `claude` processes:
```typescript
const results = await Promise.all(
  apps.map(app => invokeClaudeCode(buildSubAgentPrompt(app, request)))
)
```
Switch to Option B if debugging Option A eats >30min.

## ADB MCP Configuration

Claude Code needs an ADB MCP server. Add to `~/.claude.json` or `.claude/settings.json`:
```json
{
  "mcpServers": {
    "adb": {
      "command": "npx",
      "args": ["-y", "android-adb-mcp"]
    }
  }
}
```
Verify exact package name before implementation.

## Smoke Test Before Full Run
```bash
adb devices                                              # both serials visible
adb -s emulator-5554 shell getprop sys.boot_completed   # should print "1"
claude --print -p "What is 2+2?"                        # verify claude CLI works
```

## Key Rules
- Every ADB command in prompts must include `-s <serial>` — no exceptions
- `screenshots/` directory must exist before Claude Code runs
- Hard timeout: 3 minutes on Claude CLI invocation
- Sub-agent prompts must include memory file content (even if empty) so the structure is there
- Main agent must output ONLY the `<RESULTS>` block as final output — no trailing prose
