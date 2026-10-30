# Progressive airport map detail

All embedded and kiosk maps share a zoom hierarchy. The widest overview shows departure halls, entrances and check-in counters. Numbered gates and information desks appear next, followed by essential amenities and finally shops. Facility labels appear with more detail at close zoom. Screen-space spacing reduces symbol collisions until the closest detail level. Map zoom does not remove facilities from search or nearby rankings.

Explicit filters reveal matches sooner while retaining only permitted gray orientation labels for nonmatching landmarks. Source, destination and route use separate persistent layers and remain visible at any zoom. Selected matching facilities bypass the zoom and spacing suppression. Terminal/security-area restrictions remain enforced independently from whether an explicit facility filter is active.

Latest main was pulled before changes. The bundled map engine styling and existing licensing notices remain unchanged. No deployment or push was performed.

Validation: nine targeted tests cover the display hierarchy, filtering, selected facilities and corridor ranking; TypeScript and targeted ESLint pass. Browser inspection confirmed a sparse overview and progressively detailed gates on zoom with the actual bundled map. Full-service e2e and physical kiosk verification remain separate.
