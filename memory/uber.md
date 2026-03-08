# Uber App — Navigation Memory

## App Info
- Package: `com.ubercab.uberlite` (Uber Lite, not com.ubercab)
- Emulator: emulator-5554

## Home Screen
- Shows "Uber." logo top-left, a "Where to?" input bar at the bottom
- No explicit "Where from?" field visible on home — pickup is set separately after destination
- Tap the "Where to?" bar (around y=2056 center of screen) to open the search flow

## Entering Pickup
- After tapping "Where to?", the search screen shows a pickup field (top) and destination field below
- The pickup field is usually pre-filled with current location — leave it as-is if correct
- If you need to change pickup: tap the pickup field, use `get_uilayout` to find it (labeled "1800 N Williams St" or similar), then tap and retype

## Entering Dropoff
- The destination/dropoff field is the SECOND field on the search screen (below pickup)
- Use `get_uilayout` to identify it — it appears as a clickable element below the pickup field
- Tap it and type destination text directly; suggestions appear below
- **Known issue**: typing into the wrong field (pickup instead of dropoff) happens if you tap too high — always verify with `get_uilayout` before typing
- After typing, tap the first suggestion from `get_uilayout` (suggestions listed below the input fields)

## After Selecting Destination
- May show a "Skip" button (promotional/onboarding screen) — tap it to proceed
- Shows ride options list with prices and ETAs
- Scroll down (`input swipe 540 1800 540 1000`) to see all options — there are ~10 ride types

## Ride Options (confirmed working)
- UberX, Comfort, Electric, Pet, Comfort Electric, UberXL, UberXL Priority, UberXXL, Black, Black SUV
- Use `get_screenshot_text()` to read the full list after scrolling to bottom

## Known Issues
- Agent sometimes taps the pickup field instead of the dropoff field — verify field identity with `get_uilayout` before typing
- `get_screenshot_text()` may return garbled text (e.g. "€" instead of Uber logo) — ignore non-text artifacts
