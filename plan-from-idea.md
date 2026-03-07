# CabCompare — Hackathon Build Plan

> Voice-controlled cab price comparison and booking agent.
> User speaks a request → system navigates multiple cab apps simultaneously via Android emulators → presents ranked options → books the chosen one.

---

## What We're Building

A system with three connected pieces:
1. **Voice/text interface** — ElevenLabs agent parses user intent and presents results
2. **Backend** — receives structured booking requests, manages emulators, triggers orchestration
3. **Agent layer** — Claude Code main agent spawns sub-agents, each controlling one emulator via ADB MCP to scrape prices and book

The repos are separate. This plan defines the **contracts between them** and the **slice-by-slice build order**. Implementation details live in each repo.

---

## Core Contracts

These are fixed. Everything else is flexible.

### BookingRequest — frontend/agent → backend
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

### PriceResult — sub-agent → main agent
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

### AppConfig — stored per user, passed to agent
```typescript
{
  appName: string
  appId: string          // android package name e.g. "com.ubercab"
  emulatorSerial: string // e.g. "emulator-5554"
  snapshotName: string   // AVD snapshot to restore before each run
  notes: string          // any constraints e.g. "student free rides, campus only"
  memoryFilePath: string // path to this app's navigation memory file
}
```

---

## Build Slices

Work through these together, in order. Each slice has a clear done condition.
Do not split off large parallel workstreams — move as a team through each slice.
If a slice hits a wall, see the **If Stuck** note before going deep on a rabbit hole.

---

### Slice 1 — Core Agentic Loop (no backend, no voice)

**Goal:** Claude Code sub-agent opens one cab app, enters a hardcoded pickup and dropoff, reads all ride options and prices, returns a valid `PriceResult` JSON.

**What to build:**
- Sub-agent system prompt (see below)
- A minimal orchestrator script that fills in the prompt template and invokes Claude Code
- Screenshot output directory

**Sub-agent prompt design principles:**
- Tell it the device serial explicitly — do not let it guess which emulator to target
- Tell it to take a screenshot first, always, before attempting any action
- Give it explicit instructions for each phase: find input → enter pickup → enter dropoff → confirm → read prices
- Tell it exactly what to return and in what format — JSON only, no prose
- Give it an error return format for when things go wrong
- Include a memory section (empty for now) so the structure is there for Slice 5
- Tell it to save screenshots at each major step for debugging

**Orchestrator responsibilities in Slice 1:**
- Load sub-agent prompt template
- Fill in placeholders (device serial, app name, pickup, dropoff, memory content)
- Restore AVD snapshot before starting
- Invoke Claude Code with the filled prompt
- Extract JSON from output
- Print ranked results to stdout

**Done when:** Running the orchestrator script with hardcoded input prints a valid `PriceResult` with at least one app's options.

**If stuck:**
- If Claude Code struggles to navigate the app UI, make the sub-agent prompt more step-by-step. The screenshot+OCR loop is the core mechanism — if it's hallucinating UI elements, add an explicit instruction to only act on what it can see in the current screenshot.
- If JSON extraction from Claude's output is unreliable, instruct the prompt to output ONLY JSON with no surrounding text, and use a regex fallback to extract the first `{...}` block.

---

### Slice 2 — Two Parallel Emulators

**Goal:** Two emulators run simultaneously, two sub-agents run in parallel, main agent aggregates both results. Each sub-agent only touches its assigned emulator.

**The key thing to verify first:**
Before writing any orchestration code, manually confirm the ADB MCP server can target a specific emulator by serial (`adb -s emulator-5554 ...`). If it defaults to whatever device is connected, fix that before anything else in this slice.

**What changes from Slice 1:**
- APP_CONFIGS gets a second entry pointing to emulator-5556
- Sub-agents run in parallel not sequentially
- Main agent aggregates both `PriceResult` arrays and ranks by constraint

**Done when:** Both apps' prices appear in output at roughly the same time, and screenshots confirm each agent only touched its own emulator.

**If stuck:**
- If the MCP server can't target by serial: check the repo's issues/PRs, or wrap ADB calls in a shell script that forces `-s <serial>` on every command.
- If parallel runs interfere: fall back to sequential for the demo. It's slower but still works. Note it as a known limitation and move on.

---

### Slice 3 — Backend API

**Goal:** A running HTTP server accepts a `BookingRequest`, triggers orchestration, returns results. No more running scripts manually.

**What to build:**
- `POST /booking/request` — accepts BookingRequest, runs orchestration, returns ranked options
- `POST /booking/confirm` — accepts chosen option, triggers booking completion (can be stubbed for now)
- `GET /health` — sanity check

**Backend responsibilities:**
- Validate incoming request shape
- Fetch user's AppConfigs (hardcode for demo user in Slice 3, real DB lookup later)
- Pass everything to the orchestrator
- Return results in a shape the frontend can render

**Data storage:**
- Start with hardcoded configs for the demo user
- Add MongoDB when convenient, not before — a JSON config file on disk is fine for a hackathon

**Done when:** A POST to `/booking/request` with a valid body returns ranked options over HTTP.

**If stuck:**
- If the orchestrator invocation from the backend is flaky, add a hard timeout (180s max) and return a clear error rather than hanging.
- If Docker + emulator setup is painful on Vultr, get the demo working locally first and deploy last.

---

### Slice 4 — ElevenLabs Voice Interface

**Goal:** User speaks a cab request, agent extracts intent, calls the backend, reads options back, accepts confirmation.

**ElevenLabs agent responsibilities:**
- Collect pickup, dropoff, and priority constraint
- Ask for clarification only if pickup or dropoff is missing or ambiguous
- Call `search_cabs` tool once it has enough info
- Read back the top 3 options clearly
- Call `confirm_booking` when user confirms

**Two tools to define in the ElevenLabs dashboard:**
- `search_cabs` — maps to `POST /booking/request`
- `confirm_booking` — maps to `POST /booking/confirm`

**Frontend responsibilities:**
- ElevenLabs SDK integration with a text input fallback
- Display conversation and options panel when results arrive

**Done when:** Saying "I need a cab from X to Y, cheapest option" produces a voice response with ranked options and asks for confirmation.

**If stuck:**
- If ElevenLabs tool calling is unreliable, have the agent output a structured text block that the frontend parses and fires the API call itself.
- If voice is causing demo issues, lean on the text fallback — the core story is the emulator orchestration, not the voice layer.

---

### Slice 5 — Booking Completion + Memory Files

**Goal:** User confirms, the winning sub-agent completes the booking, other emulators are released, memory files updated.

**Booking completion:**
- Confirmed app's emulator should still be on the price options screen
- Sub-agent re-prompts with booking mode: select the confirmed option, tap confirm/request, read the confirmation screen, return a booking confirmation
- Pass confirmation back to user via voice

**Memory files:**
- One markdown file per app (e.g. `memory/uber.md`)
- Sub-agent appends notes after every run — what worked, what didn't, any reliable tap coordinates, quirks in the UI
- Loaded as context at the start of every subsequent run for that app
- Low effort, high value — even rough notes make the next run meaningfully more reliable

**Cleanup:**
- After confirmation, kill or release emulators for non-chosen apps
- Restore them to snapshot so they're ready for the next request

**Done when:** User confirms option, cab is booked, confirmation is read back, memory file has a new entry.

**If stuck:**
- If auto-booking is unreliable (surge dialogs, extra confirmation steps), have the sub-agent take a screenshot and surface it to the user asking them to confirm what they see. Graceful degradation is better than a broken auto-book.

---

## Infrastructure Notes

**Emulator snapshots — do this before the hackathon starts:**
- Create AVDs, manually log into each cab app, add payment method, land on the app home screen
- Save a snapshot at that exact state
- Every run restores from snapshot — clean, consistent starting point every time
- Cold boot is 3+ minutes; snapshot restore is ~10 seconds

**Emulator pool:**
- Keep emulators always running and always at snapshot
- Assign to requests rather than spinning up per request
- For a 2-app demo: 2 emulators, always warm

**Deployment:**
- Get everything working locally first
- Deploy to Vultr only when the local demo is solid
- Don't let deployment issues eat hackathon hours

---

## Demo Script (for judges)

1. Open web app on a phone
2. Tap mic: *"I need a cab from [pickup] to [dropoff]. Cheapest option."*
3. Show both emulators navigating live on a screen
4. Agent reads back top options with prices and ETAs
5. *"Book the first one"*
6. Agent completes booking, reads confirmation
7. Show memory file with new notes appended

**Talking points:**
- Vision-based navigation (screenshot + OCR) — resilient to app UI updates
- Fully autonomous from voice to booking
- Learns from its own mistakes via per-app memory files
- Constraint-aware ranking: cheapest vs fastest vs most comfortable

---

## Slice Completion Checklist

- [ ] **Slice 1** — Single emulator, hardcoded input, valid PriceResult JSON
- [ ] **Slice 2** — Two parallel emulators, aggregated results, no cross-contamination
- [ ] **Slice 3** — Backend API accepts BookingRequest, returns options over HTTP
- [ ] **Slice 4** — Voice input → parsed intent → options read back to user
- [ ] **Slice 5** — Booking completes, memory files updated

**Minimum viable demo:** Slices 1–3 prove the technology. Slice 4 makes it feel like a product. Slice 5 closes the loop.
