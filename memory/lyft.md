# Lyft App — Navigation Memory

## App Info

- Package: `com.lyft.android`
- Emulator: emulator-5556

## Deep Link

- Deep link works reliably — always attempt Phase 0 first
- Format: `lyft://ridetype?id=lyft&pickup[latitude]=...&pickup[longitude]=...&destination[latitude]=...&destination[longitude]=...`
- After launch, a promotional/onboarding screen may appear with a **"Skip" button** — tap it before checking for prices

## Reading Prices — IMPORTANT

- **Lyft prices are NOT exposed in the Android accessibility tree.** `get_all_ui_text` will never return `$` price values for Lyft — do not use it for price reading.
- Use `get_screenshot_text` (OCR) to read prices after each scroll.
- Discounted prices: OCR returns two price strings near the same ride row. The active price is the second one (higher `center_y` value — lower on screen). The first is struck-through.
- Scroll down to reveal all ride types — use `get_screenshot_text` after each scroll, not `get_all_ui_text`.
- Termination: when two consecutive `get_screenshot_text` calls return the same set of ride names, the list is complete. Stop — do NOT scroll back up.

## Ride Options (confirmed working — Boulder to DEN run)

- Priority Pickup, Standard, Wait & Save, Extra Comfort, XL, XXL, Black, Black SUV, Green, Pet
- Pet option seems to be the last. If you see that option in the screenshot, extract all the prices and return the result immediately. Do not try to scroll more.

## Known Issues

- `get_all_ui_text` returns only UI chrome (buttons, banners) — never prices. Always use `get_screenshot_text` for price data.
