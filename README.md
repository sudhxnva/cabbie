# Cabbie

> AI-powered cab price comparison and booking — navigates real apps on Android emulators using Claude agents.

<div align="center">
  <a href="https://www.youtube.com/watch?v=ibSTQ5sBlCk">
    <img src="https://img.youtube.com/vi/ibSTQ5sBlCk/maxresdefault.jpg" alt="Cabbie Demo" width="720" />
  </a>
</div>

---

## What is this?

Cabbie is a hackathon project that compares prices across multiple cab apps (Uber, Lyft, CU Night Ride) and books the best option — without any official APIs.

Instead of scraping or reverse-engineering APIs, Cabbie spins up Android emulators, restores logged-in app snapshots, and dispatches Claude Code sub-agents to each emulator in parallel. Each agent navigates the app UI autonomously, reads the price list, and returns structured JSON. The orchestrator ranks results by your constraint (cheapest, fastest, etc.) and optionally books the winner.

---

## How it works

```
User request
     │
     ▼
Orchestrator (Node.js)
     │
     ├─── Restore emulator snapshots (AVD)
     ├─── Launch cab apps via ADB
     │
     ├─── Sub-agent: Uber     ──► emulator-5554
     ├─── Sub-agent: Lyft     ──► emulator-5556
     └─── Sub-agent: CU Night ──► emulator-5556 (or separate)
              │
              │   (all run in parallel via Promise.all)
              ▼
         PriceResult[]
              │
              ▼
         Rank by constraint
              │
              ▼
         Book best option  ◄── Booking sub-agent (optional)
```

Each sub-agent is a `claude-sonnet-4-6` instance with:
- Access to a custom Android MCP server (tap, type, screenshot, ADB shell)
- A navigation prompt seeded with per-app memory from previous runs
- A deep link URI to skip manual address entry where supported
- A JSON output schema — no prose, just structured results

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript, Node.js (`tsx`) |
| AI Agents | `@anthropic-ai/claude-code` SDK — `query()` |
| Device Control | `@devicefarmer/adbkit` (Node.js API) + custom Android MCP server |
| Database | MongoDB via Mongoose |
| Geocoding | Address → lat/lng for deep links |
| Deep Links | Per-app URI schemes (`uber://`, `lyft://`, etc.) |

---

## Project Structure

```
cabbie/
├── src/
│   ├── index.ts          # Entry point — starts HTTP server
│   ├── orchestrator.ts   # Core logic: emulators → agents → rank → book
│   ├── claude.ts         # Claude SDK wrappers (sub-agent, booking agent)
│   ├── emulator.ts       # ADB helpers: restoreSnapshot, launchApp, waitForBoot
│   ├── types.ts          # BookingRequest, AppConfig, PriceResult, etc.
│   ├── server.ts         # HTTP API (POST /booking/request, POST /booking/confirm)
│   ├── deeplink.ts       # Per-app deep link URI builders
│   ├── geocode.ts        # Address geocoding
│   ├── availability.ts   # Service window checks (CU Night Ride is hours-limited)
│   ├── db.ts             # MongoDB schemas
│   ├── sessions.ts       # Booking session storage
│   └── log.ts            # Timestamped logger
├── prompts/
│   ├── sub-agent.md      # Navigation prompt template (price scraping)
│   └── booking-agent.md  # Booking confirmation prompt template
├── memory/
│   ├── uber.md           # Uber-specific navigation notes
│   ├── lyft.md           # Lyft-specific navigation notes
│   └── cunightride.md    # CU Night Ride-specific navigation notes
├── config/
│   └── hardcoded.ts      # Demo booking request + DB config helpers
└── screenshots/          # Per-step screenshots saved by agents
```

---

## Emulator Setup

| Emulator | AVD Name | App | Package | Snapshot |
|----------|----------|-----|---------|----------|
| `emulator-5554` | `Pixel_8_2_-_Uber` | Uber | `com.ubercab` | `uber-logged-in` |
| `emulator-5556` | `Pixel_8_2_-_CU_NightRide` | CU Night Ride | `com.sparelabs.platform.rider.cunightride` | `cunightride-logged-in` |
| `emulator-5556` | `Pixel_8` | Lyft | `com.lyft.android` | `lyft-logged-in` |

Each snapshot restores to a logged-in home screen ready for destination entry.

---

## Core Data Types

```typescript
// What the user (or frontend) sends
interface BookingRequest {
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

// What each sub-agent returns
interface PriceResult {
  appName: string
  success: boolean
  error?: string
  options: {
    name: string        // "UberX", "Lyft Standard"
    price: string       // kept as string — OCR may return "$12-14"
    priceMin?: number
    etaMinutes: number
    category: 'standard' | 'comfort' | 'xl' | 'luxury' | 'eco' | 'free'
  }[]
}
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Android Studio with AVDs configured (see Emulator Setup above)
- `adb` on PATH
- MongoDB instance (local or Atlas)
- Anthropic API key

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, MONGODB_URI
```

### Run

```bash
# Start the HTTP server
npm run server

# Or run the orchestrator directly with hardcoded config
npm run dev
```

### Smoke Test

Run this from a terminal **outside** any active Claude Code session (the SDK spawns a `claude` subprocess):

```bash
adb devices                                              # both serials visible
adb -s emulator-5554 shell getprop sys.boot_completed   # should print "1"
npx -y adb-mcp --help                                   # verify MCP package
```

---

## HTTP API

```
POST /booking/request
  Body: BookingRequest
  Returns: { sessionId, results: RankedResult[] }

POST /booking/confirm
  Body: { sessionId, optionId }
  Returns: BookingConfirmation

GET /health
  Returns: { status: "ok" }
```

---

## Agent Design

### Sub-agent (price scraping)

Each sub-agent follows a fixed phase sequence:

1. **Deep link launch** — attempt `am start` with a pre-built URI to skip manual address entry
2. **UI navigation fallback** — tap pickup field, type address, select autocomplete suggestion, repeat for dropoff
3. **Price reading** — three fallback modes:
   - Mode A: `get_all_ui_text` (accessibility tree)
   - Mode B: `get_screenshot_text` (OCR)
   - Mode C: `get_screenshot` (visual, for apps where prices aren't in the a11y tree — Uber, Lyft)
4. **Return JSON** — structured `PriceResult`, no prose

Agents are seeded with per-app memory files that accumulate navigation notes across runs, making them faster and more reliable over time.

### Booking agent

After the user confirms a selection, a separate booking agent:
1. Verifies the options screen is still visible
2. Taps the confirmed ride option
3. Taps the booking confirmation button
4. Returns success/failure JSON

---

## Agent Constraints

| Parameter | Value |
|-----------|-------|
| Model | `claude-sonnet-4-6` |
| Max turns | 30 |
| Budget cap | $0.50 per sub-agent |
| Permission mode | `bypassPermissions` |
| Output format | JSON schema (`PriceResult`) |

---

## Known Limitations

- **Uber/Lyft prices** are not in the Android accessibility tree — agents must use screenshot OCR (Mode C), which is slower and occasionally misreads ranges like `$12–14`
- **CU Night Ride** only operates on weekday evenings and weekends — the orchestrator checks service windows before dispatching an agent
- **Session expiry** — if too much time passes between price comparison and booking confirmation, the app session may have expired and the booking agent will return failure
- **Parallel emulators** — both apps sharing `emulator-5556` cannot run simultaneously; the orchestrator handles sequencing

---

## Hackathon Context

Built for a hackathon demo. The architecture prioritises working end-to-end over production hardening. MongoDB replaces hardcoded configs; voice interface (ElevenLabs) is planned but not implemented.

---

## License

MIT
