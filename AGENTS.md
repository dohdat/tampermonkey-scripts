# AGENTS
- Project mixes standalone Tampermonkey user scripts and a Chrome MV3 extension (`Skedpal alternative`); keep instructions lean and practical.

## Guardrails
- Keep every source file under ~600 lines; split modules or extract helpers before crossing the limit.
- Stick to plain JS/HTML/CSS already in use; avoid new build pipelines, bundlers, or frameworks.
- Maintain accurate Tampermonkey metadata blocks (name, namespace, version, match/grant). Bump `@version` when behavior changes.
- For the extension, preserve MV3 module service worker behavior; avoid persistent globals and keep background work minimal.
- No secrets in repo (OAuth client IDs stay placeholders). Pin external assets and add fallbacks if you must load from CDNs.
- Prefer IndexedDB (already used) over localStorage; avoid new storage backends unless justified.

## Coding Style
- Favor small, single-purpose functions and composable helpers; keep shared utilities in `src/ui/utils.js` or nearby.
- Be defensive with DOM access (null checks, stable selectors). Avoid brittle selectors tied to cosmetic changes on target sites.
- Keep comments short and only where intent is non-obvious (especially around scheduling logic and Calendar API calls).
- For CSS, edit `styles/tailwind.input.css` and rebuild `styles/tailwind.css` with  
  `npx tailwindcss@latest -i styles/tailwind.input.css -o styles/tailwind.css --content pages/index.html,src/ui/page.js --minify`.

## Testing & Validation
- User scripts: manual checks on target sites (e.g., LeetCode). Ensure single injection guard, external libs load with fallbacks, and UI still usable with slow networks.
- Scheduler extension: load unpacked, exercise Tasks/TimeMaps/Schedule tabs, run **Reschedule Now**, and confirm events respect deadlines, priorities, and allowed TimeMaps within the 14-day horizon.
- Storage changes: verify IndexedDB migrations keep existing user data; avoid destructive schema tweaks without migration steps.
- Networked features: handle auth failures and rate limits gracefully; log errors to console, not alerts.

## File Organization
- Group code by feature folders already present (`background`, `core`, `data`, `ui`, `ui/tasks`, `ui/state`); place new files alongside related code rather than growing a single file past the 600-line cap.
- Keep `manifest.json` host permissions tight and scope additions to what is strictly required.
- Images/assets live in `icons/`; vendorized libraries belong in `vendor/` and should be versioned.

## Quick Review Checklist
- Files stay <600 lines; complex additions are split into focused modules.
- Metadata/version updated for user scripts; manifest and permissions remain minimal.
- Scheduling changes keep deadline/priority/TimeMap rules intact; background service worker remains lightweight.
- Tailwind rebuilt when HTML changes affect styles; generated CSS not edited by hand.
