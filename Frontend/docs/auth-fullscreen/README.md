# Auth fullscreen and header CTA

Base: `origin/main` at `96c9bbe` (merged PR #7). Branch: `fix/auth-fullscreen-cta-v1`, separate worktree.

Guest auth uses the desktop viewport minus the 64px header via `100dvh`. The centered composition caps at 840px tall; typography, spacing and the flexible SVG fit the 1280x800 viewport. Content overflow is not hidden. At mobile widths the original natural document flow and 64px bottom navigation remain; short screens and the on-screen keyboard may scroll naturally.

The footer is rendered on all other routes and for a signed-in profile. Its condition also excludes API preview mode. Auth/store/routing behavior is unchanged.

The desktop account navigation link uses `--accent` / `--on-accent`, 24px horizontal padding, existing radius, hover/active colors and a visible offset focus outline. Its active underline is removed on desktop. Mobile retains the existing compact navigation layout and active indicator. The link has no disabled state because it is always navigable.

This requested header action is an explicit exception to the design guide's single-accent-action preference on the auth screen; existing color and spacing tokens are retained.

## Validation

- `npm ci`: passed, 0 audit vulnerabilities.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:smoke -- --workers=2`: **35 passed**. Final screenshot-focused run: **10 passed**, with CSS animations disabled during captures. One earlier run had a transient existing profile-reload test failure; the complete repeat passed without application changes. Tests run with `PLAYWRIGHT_CHANNEL=msedge`, `CI=true`, `CHOKIDAR_USEPOLLING=true` (installed Edge; Windows watcher polling).
- Five viewports: 1920x1080, 1440x900, 1280x800, 390x844, 375x812; light and dark themes.
- Added assertions for document height on desktop in registration and login; note and illustration footer visibility; footer removal/restoration on login/logout and route changes; CTA colors, underline, focus and mobile height; horizontal overflow; native required validation and the application's whitespace-name validation error; JavaScript errors.
- Before screenshots captured from the unchanged base before implementation. After screenshots cover both auth modes and validation errors. Existing tests continue to cover password visibility, malformed email, short passwords, theme persistence, favorites, matching, sorting and API adapters.
- Manual review: 1920x1080 dark registration, 1280x800 light registration and dark errors, 375x812 light errors. The desktop form and SVG fit; mobile errors remain readable and content can scroll beyond the bottom nav.

## Screenshots

All screenshots are in [screenshots](screenshots/). Names include before/after, mode, theme and viewport project (`desktop-large`, `desktop`, `desktop-small`, `mobile`, `mobile-small`).

| View | Before | After |
| --- | --- | --- |
| 1280x800 light registration | [Before](screenshots/before-register-light-desktop-small.png) | [After](screenshots/after-register-light-desktop-small.png) |
| 1280x800 dark registration | [Before](screenshots/before-register-dark-desktop-small.png) | [After](screenshots/after-register-dark-desktop-small.png) |
| 1440x900 light login | [Before](screenshots/before-login-light-desktop.png) | [After](screenshots/after-login-light-desktop.png) |
| 1440x900 dark login | [Before](screenshots/before-login-dark-desktop.png) | [After](screenshots/after-login-dark-desktop.png) |
| 375x812 light registration | [Before](screenshots/before-register-light-mobile-small.png) | [After](screenshots/after-register-light-mobile-small.png) |
| 375x812 dark registration | [Before](screenshots/before-register-dark-mobile-small.png) | [After](screenshots/after-register-dark-mobile-small.png) |
| Mobile validation | — | [Light](screenshots/after-error-light-mobile-small.png), [dark](screenshots/after-error-dark-mobile-small.png) |

