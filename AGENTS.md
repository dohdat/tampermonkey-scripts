# AGENTS
- Project mixes standalone Tampermonkey user scripts and a Chrome MV3 extension (`Skedpal alternative`); keep instructions lean and practical.

## Guardrails
- Stick to plain JS/HTML/CSS already in use; avoid new build pipelines, bundlers, or frameworks.
- Maintain accurate Tampermonkey metadata blocks (name, namespace, version, match/grant). Bump `@version` when behavior changes.
- For the extension, preserve MV3 module service worker behavior; avoid persistent globals and keep background work minimal.
- No secrets in repo (OAuth client IDs stay placeholders). Pin external assets and add fallbacks if you must load from CDNs.
- Prefer IndexedDB (already used) over localStorage; avoid new storage backends unless justified.

## Coding Style
- Always add a `data-test-skedpal` attribute to any DOM elements you create or modify, to make debugging and test selectors stable and explicit.
- Use theme.js colors and Tailwind classes consistently for UI elements; avoid hardcoded colors or styles.
- Favor small, single-purpose functions and composable helpers; keep shared utilities in `src/ui/utils.js` or nearby.
- Be defensive with DOM access (null checks, stable selectors). Avoid brittle selectors tied to cosmetic changes on target sites.
- For CSS, edit `styles/tailwind.input.css` and rebuild `styles/tailwind.css` with  
  `npm run build:css`.
- Any code that adds an event listener **must also define explicit cleanup**.
- Do not add event listeners without a clear removal path.
- Prefer patterns where adding a listener returns a cleanup function.
- Avoid anonymous functions in `addEventListener`, handlers must be named so they can be removed.
- Clean up listeners on:
  - DOM removal
  - feature teardown
  - navigation or reinjection
  - extension service worker shutdown paths

### Preferred pattern

```js
function setupResizeListener() {
  window.addEventListener("resize", onResize);

  return () => {
    window.removeEventListener("resize", onResize);
  };
}
```
## Testing & Validation
- Add unit tests for any new features or logic changes to prevent regressions.
- After any code changes, always run `npm run test:coverage` to confirm functionality and prevent regressions.
- Ensure single injection guard, external libs load with fallbacks, and UI still usable with slow networks.
- Scheduler extension: load unpacked, exercise Tasks/TimeMaps/Schedule tabs, run **Reschedule Now**, and confirm events respect deadlines, priorities, and allowed TimeMaps within the 14-day horizon.
- Storage changes: verify IndexedDB migrations keep existing user data; avoid destructive schema tweaks without migration steps.
- Networked features: handle auth failures and rate limits gracefully; log errors to console, not alerts.


## File Organization
- Group code by feature folders already present (`background`, `core`, `data`, `ui`, `ui/tasks`, `ui/state`); place new files alongside related code rather than growing a single file past the 600-line cap.
- Keep `manifest.json` host permissions tight and scope additions to what is strictly required.
- Images/assets live in `icons/`; vendorized libraries belong in `vendor/` and should be versioned.

## Quick Review Checklist
- Metadata/version updated for user scripts; manifest and permissions remain minimal.
- Scheduling changes keep deadline/priority/TimeMap rules intact; background service worker remains lightweight.
- Tailwind rebuilt when HTML changes affect styles; generated CSS not edited by hand.

