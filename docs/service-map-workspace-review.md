# Map workspace at service entry

This supersedes the earlier device-only fullscreen behavior. The main page remains the service home. Opening /navigate or selecting mobility assistance opens the full map workspace immediately, including in an ordinary browser without a kiosk session. The existing shared header remains above it. Landscape uses the left sidebar; portrait uses the responsive bottom panel.

Navigation controls, search, nearby results and route actions live inside the sidebar. Mobility additionally places the existing service options, request fields, consent and review button in that same panel, within the original form. Review keeps the original validation and confirms the selected pickup and destination; Edit returns to the map retaining those values. Device identity still controls the known current location, idle timeout and pickup restrictions independently from layout. No current position is fabricated for an unregistered browser.

The first-render map spacing code now tolerates a not-yet-rendered viewport instead of reading coordinates from null.

Verification used the actual Next production server with an isolated mock database. Main page → navigation opened the workspace without kiosk login. Main page → mobility → gate 25 → nearest restroom → 92m route → consent → review displayed the same pickup/destination; Edit retained them. Build, TypeScript and lint passed (two existing StampBook image warnings). Full-suite assertions passed except a worker killed during flights-ingest; rerunning that file alone passed all 8 tests. Combined result: 995 passed, 5 skipped. Browser final-submit/API persistence and physical-device checks were not repeated for this UI change.

Latest main was pulled before implementation. The package is for local application to the user's checkout, whose development port is 3001; it does not update the live Vercel site or push Git commits. Previous map licensing/source notes still apply.
