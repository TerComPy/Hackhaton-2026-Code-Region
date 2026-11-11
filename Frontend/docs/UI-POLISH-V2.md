# Frontend UI polish v2

Base: `origin/main` at `aadc8f5`. Branch: `feat/frontend-auth-redesign-v2`.

The auth screen uses a 1160px, 46/54 editorial layout and an original inline SVG opportunity map. Both themes use the existing palette. Below 720px the illustration is hidden. The illustration is static, and existing reduced-motion rules remain active. No image or graphics dependency was added. The task included no attached visual references, so composition follows its written brief and `VanillaFrontend/DESIGN.md`; the SVG is the requested exception to the guide's photography preference.

Registration and login retain the local demo profile contract, favorites and navigation. Passwords are neither persisted nor verified by a server. The visibility button now announces its current action. Email validation also rejects whitespace and incomplete domains.

Sorting retains native keyboard and touch behavior. The missing `input` class caused the browser appearance; the sort control now inherits field styling and the existing CSS chevron. Disabled controls have an explicit state. Newest-first now orders mock `posted` labels by age rather than retaining fixture order. Matching logic and public store contracts are unchanged.

Validation:

- `npm ci`: passed, 0 audit vulnerabilities.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:smoke -- --workers=2`: **20 passed** using installed Microsoft Edge (`PLAYWRIGHT_CHANNEL=msedge`, `CI=true`, `CHOKIDAR_USEPOLLING=true`). Bundled Playwright Chromium is not installed. Polling avoids a Windows filesystem watcher EBUSY failure.
- Viewports: 1440x900, 1280x800, 390x844, 375x812; auth and sorting tested in light/dark themes.
- Tests cover native validation, password visibility, registration/login switching, demo persistence, sorting order changes, keyboard selection, theme reload, JS errors and catalog horizontal overflow; existing route, favorites, matching and API adapter checks also pass.
- Visual review: light desktop/mobile and dark desktop/mobile plus dark sort control inspected. Form remains usable above mobile navigation; no visible horizontal clipping. The 1280x800 desktop composition extends slightly below the viewport and permits normal vertical scrolling.

Screenshots in [screenshots](screenshots/) use `before-` (base commit), `after-`, `auth`, `login`, `sort`, theme and viewport names. Before screenshots reproduce the base account/styles/catalog files, then restore the implementation. New login screenshots are included for both themes and all four sizes.

| Screen | Before | After |
| --- | --- | --- |
| Desktop light | [Before](screenshots/before-auth-light-desktop.png) | [After](screenshots/after-auth-light-desktop.png) |
| Desktop dark | [Before](screenshots/before-auth-dark-desktop.png) | [After](screenshots/after-auth-dark-desktop.png) |
| Mobile light | [Before](screenshots/before-auth-light-mobile-small.png) | [After](screenshots/after-auth-light-mobile-small.png) |
| Mobile dark | [Before](screenshots/before-auth-dark-mobile-small.png) | [After](screenshots/after-auth-dark-mobile-small.png) |
| Sort light | [Before](screenshots/before-sort-light-desktop.png) | [After](screenshots/after-sort-light-desktop.png) |
| Sort dark | [Before](screenshots/before-sort-dark-desktop.png) | [After](screenshots/after-sort-dark-desktop.png) |
