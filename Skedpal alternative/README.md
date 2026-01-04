## Personal SkedPal-Style Scheduler (Chrome MV3)

Manual, deterministic task scheduler that mirrors SkedPal rules and writes to Google Calendar only when you click **Reschedule Now**.

### Features
- Tasks stay flexible until scheduled; carry duration (15m increments), deadline, priority, allowed TimeMaps.
- TimeMaps define availability blocks (days + start/end times); scheduler only places tasks within these blocks.
- Scheduler horizon defaults to 14 days; tasks beyond the horizon are ignored.
- Runs on demand: deletes previously scheduled task events, pulls FreeBusy, and fills the earliest valid free blocks (deadline asc, priority desc).
- IndexedDB persistence (tasks, timemaps, settings); dark-mode UI with Tasks, TimeMaps, Schedule pages.
- Tailwind styling compiled locally to `tailwind.css` (no CDN at runtime).

### Setup
1) In `manifest.json`, replace `REPLACE_WITH_OAUTH_CLIENT_ID.apps.googleusercontent.com` with a real OAuth client ID configured for Chrome extensions.
   - OAuth scope required: `https://www.googleapis.com/auth/calendar`.
   - Add `https://www.googleapis.com/*` to allowed origins when creating the client.
2) Enable the Google Calendar API for the project owning the client ID.
3) Load the extension unpacked in Chrome:
   - `chrome://extensions` -> enable Developer Mode -> Load unpacked -> select the `Skedpal alternative` folder.
4) If you change the UI markup and need to rebuild Tailwind, run inside the folder:
   - `npx tailwindcss@latest -i tailwind.input.css -o tailwind.css --content index.html,page.js --minify`

### Usage
- Click the extension icon to open the scheduling UI (options page) in a tab, or open it via the extension’s Options.
- **TimeMaps tab:** Create availability windows (days + start/end). These constrain all scheduling.
- **Tasks tab:** Add tasks with duration (15m multiples), priority, deadline, and allowed TimeMaps.
- **Schedule tab:** Adjust horizon if needed, then click **Reschedule Now**.
  - Flow: delete prior `source=personal-skedpal` events -> call FreeBusy -> schedule -> create events with `extendedProperties.private.source = personal-skedpal`.
- Tasks with deadlines outside the horizon are marked ignored; others that cannot fit remain unscheduled.

### Notes
- No background automation; scheduling only happens on button press.
- No task splitting; no DOM scraping; uses IndexedDB (not localStorage).
- The UI shows scheduled vs. unscheduled counts and the last run timestamp. Default theme is dark with no toggle.

### Quick validation
- Create two TimeMaps (e.g., Deep Work weekdays 09:00–12:00, Admin weekdays 13:00–17:00).
- Add tasks with 15–60 minute durations, deadlines within 14 days, and assign TimeMaps.
- Click **Reschedule Now**; confirm Calendar events appear inside the allowed TimeMaps and the Schedule summary updates counts.
