# Uber App — Navigation Memory

## App Info

- Package: `com.ubercab`
- Emulator: emulator-5554

## Home Screen

- Shows "Uber." logo top-left, a "Where to?" input bar at the bottom
- No explicit "Where from?" field visible on home — pickup is set separately after destination
- Tap the "Where to?" bar (around y=2056 center of screen) to open the search flow

## Entering Pickup

- After tapping "Where to?", the search screen shows a pickup field (top) and destination field below
- The pickup field is usually pre-filled with current location — leave it as-is if correct
- If you need to change pickup: tap the pickup field, then tap and retype

## Entering Dropoff

- The destination/dropoff field is the SECOND field on the search screen (below pickup)
- Tap it and type destination text directly; suggestions appear below
- After typing, tap the first suggestion from the dropdown

## After Selecting Destination

- May show a "Skip" button (promotional/onboarding screen) — tap it to proceed
- Shows ride options list with prices and ETAs

## Reading Prices — IMPORTANT

- **Uber prices are NOT exposed in the Android accessibility tree.** `get_all_ui_text` will never return ride names or `$` price values — do not use it for price reading.
- **`get_screenshot_text` (OCR) also does not work for Uber** — it returns garbled text due to Uber's custom font renderer.
- Use `get_screenshot` (visual reading) to read prices. The model reads the image directly.
- Scroll down once per step, take a `get_screenshot`, read all visible prices, stop when "Black SUV" appears — that is the last ride type.

## Ride Options (confirmed working — Boulder to DEN run)

- Wait & Save, UberX, Comfort, Priority, Electric, Pet, UberXL, UberXL Priority, UberXXL, Black, Black SUV, Transit
- **Black SUV is the last option.** When you see it, record its price and stop scrolling immediately.

## Known Issues

- `get_all_ui_text` returns only map labels, payment info, and CTA buttons — never ride names or prices
- `get_screenshot_text` returns garbled characters (e.g. "4:020", "O") — do not use it
