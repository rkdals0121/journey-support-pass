# Kiosk full-screen airport map

The kiosk navigation and mobility map now occupy the full display below the shared service header. A scrollable left panel contains search, departure/current location, destination and nearby results; terminal and facility controls sit above the map. Collapsing the panel gives the map the full width. Portrait kiosks use a bottom panel. Mobile and desktop retain the embedded responsive map.

The map measures the toolbar and panel to fit routes into the unobscured area. Terminal overview uses geometry in the current view rotation, avoiding the excessive empty space produced by fitting a north-aligned bounding box. Zoom buttons remain above the portrait panel. Controls retain the existing design tokens and kiosk touch sizes.

Mobility assistance opens the same workspace. Selecting Done returns to the request form with the selected pickup and destination intact; the map can be reopened. Existing validation, destination persistence, current-location override, facility filtering and corridor-distance ranking remain in place.

Before implementation, local work was preserved and origin/main was pulled: latest main 6107ae3. This change does not alter the shared header or deploy the service.

Validation: TypeScript and ESLint passed; full suite 992 passed / 5 skipped; Next production build passed. Browser checks of actual React components and the bundled map verified a 92m navigation route and a 46m mobility route, selection persistence on Done, and panel collapse. Landscape 1280x800 and portrait 1080x1920 fill the viewport at font scales 1 and 1.5 without horizontal document overflow. Phone and narrow-phone layouts at scale 1.5 remain embedded without horizontal overflow. Full-service authenticated e2e, production and physical kiosk verification were not performed in this environment. Existing map source and licensing notices remain applicable.
