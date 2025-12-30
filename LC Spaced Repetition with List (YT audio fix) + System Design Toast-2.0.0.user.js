// ==UserScript==
// @name         LC Spaced Repetition with List (YT audio fix) + System Design Toast
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  SRS buttons, redirect to current problem, daily countdown; system-design items behave like LC problems (score/queue/timers) + a mini toast.
// @author       You
// @match        https://leetcode.com/*
// @match        https://*.leetcode.com/*
// @match        https://facebook.com/*
// @match        https://www.facebook.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://codesandbox.io/p/sandbox/*
// @match        https://youtu.be/*
// @match        https://linkedin.com/*
// @match        https://www.linkedin.com/*
// @exclude      https://www.youtube.com/embed/*
// @exclude      https://m.youtube.com/embed/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js
// @resource     hljsCSS https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css
// @run-at       document-end
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        unsafeWindow
// ==/UserScript==

/* ----------------------------------------------
   Config
---------------------------------------------- */
const DAILY_TIME_LIMIT_HOURS = 4;
const DAILY_TIME_LIMIT_SECONDS = DAILY_TIME_LIMIT_HOURS * 60 * 60;

// Turn on when practicing for real interviews
const REQUIRE_TIME_AND_SPACE_COMPLEXITY = false;

/* ----------------------------------------------
   Storage helpers (Tampermonkey)
---------------------------------------------- */
const storageCache = {
    perQuestionTimers: {},
    leetcodeSR: {},
    leetcodeQueue: [],
    leetcodeCurrent: null
};

async function gmReadJSON(key, fallback) {
    try {
        const raw = await GM.getValue(key, null);
        if (raw == null) return fallback;
        if (typeof raw === 'string') return JSON.parse(raw);
        if (typeof raw === 'object') return raw;
        return fallback;
    } catch {
        return fallback;
    }
}

async function gmWriteJSON(key, value) {
    try {
        await GM.setValue(key, JSON.stringify(value));
    } catch (_) {
        /* noop */
    }
}

const storageReady = (async () => {
    storageCache.perQuestionTimers = await gmReadJSON('lc_perQuestionTimers', {});
    storageCache.leetcodeSR = await gmReadJSON('leetcodeSR', {});
    storageCache.leetcodeQueue = await gmReadJSON('leetcodeQueue', []);
    storageCache.leetcodeCurrent = await GM.getValue('leetcodeCurrent', null);
})();

/* ----------------------------------------------
   Main
---------------------------------------------- */
(async () => {
    await storageReady;

    const hostname = window.location.hostname;
    const isLeetcode = hostname.includes('leetcode.com');
    const isCodesandbox = hostname.includes('codesandbox.io');
    const codeSandboxUrl = "https://codesandbox.io/p/sandbox/fervent-browser-mhcykc?file=%2Fsrc%2FApp.js%3A7%2C50";

    if (isLeetcode || isCodesandbox) {
        /* ----------------------------------------------
     Study items (LC + System Design)
  ---------------------------------------------- */
        /*         {
            type: "system-design",
            title: "Design Bit.ly",
            url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/bitly#high-level-design",
            topic: `
High level design: Users submit a long URL and receive a shortened version.

Q: What are the main components?
A: A web or API client for user input, a primary backend service that handles URL creation, validation, and authentication, and a database with a unique short_code index that stores long_url, owner, timestamps, and expiration details.

Q: How is a long URL validated?
A: The service parses and normalizes the input URL, rejects unsafe or private network addresses, and deduplicates by comparing normalized hashes. This prevents storing invalid URLs, avoids collisions, and improves data quality.

Q: Why use 302 instead of 301?
A: A 302 redirect is temporary and not cached, which lets the service track every click, update destinations, and expire links gracefully. A 301 is permanent and cached, which prevents analytics and future edits.

Q: How are custom aliases handled?
A: The system validates the alias format, reserves system keywords, and enforces uniqueness with a database constraint. For custom aliases, availability is checked before insert; for generated codes, conflicts trigger retries until a unique code is produced.

Q: What happens on redirect?
A: When a user accesses GET /:code, the service checks the cache for a matching mapping. On a hit, it returns a 302 redirect immediately. On a miss, it fetches from the database, verifies it’s active, warms the cache, and responds with a 302. Expired or missing codes return a 404 or fallback page.

Q: Draw high level design
A: https://i.imgur.com/O0uesHd.png
`,
            difficulty: "Easy",
            playground: "https://leetcode.com/playground/3Du5jhPL"
        }, */
        const study_items = [
            // ⚛️ React System Design (Frontend Fundamentals)
            {
                type: "system-design",
                title: "Build a Searchable, Filterable List",
                url: "https://codesandbox.io/p/sandbox/fervent-browser-mhcykc?",
                topic: `
Requirements:
Q: - Render a list of items
A: N/A

Q: - Use a controlled input for search
A: N/A

Q: - Filter the list as the user types
A: N/A

Q: - Perform case-insensitive matching
A: N/A

Q: - Avoid unnecessary re-renders
A: N/A

Q: - Support debounced search
A: N/A

Q: - Highlight matched text in results
A: N/A

Q: - Handle large lists efficiently
A: N/A
`,
                difficulty: "Easy",
                playground: "https://codesandbox.io/p/sandbox/fervent-browser-mhcykc?"
            },
            {
                type: "system-design",
                title: "Build a Polling Component",
                url: "https://codesandbox.io/p/sandbox/friendly-carson-zwqtd8?",
                topic: `
Q: Fetch data from an API every 5 seconds
A: N/A

Q: Update UI with the latest data
A: N/A

Q: Set up and clean up polling intervals
A: N/A

Q: Avoid stale closures
A: N/A

    `,
                difficulty: "Medium",
                playground: "https://codesandbox.io/p/sandbox/friendly-carson-zwqtd8?"
            },
            {
                type: "system-design",
                title: "Build Tic Tac Toe",
                url: "https://codesandbox.io/p/sandbox/ecstatic-archimedes-rd55p2",
                topic: `
Q: Render a 3x3 game board
A: N/A

Q: Allow two players to take turns placing X and O
A: N/A

Q: Prevent moves on already occupied cells
A: N/A

Q: Track the current player
A: N/A

Q: Detect a winning condition
A: N/A

Q: Detect a draw when the board is full
A: N/A

Q: Display the game status (current turn, win, or draw)
A: N/A

Q: Disable the board after the game ends
A: N/A

Q: Provide a way to reset the game
A: N/A
    `,
                difficulty: "Easy",
                playground: "https://codesandbox.io/p/sandbox/ecstatic-archimedes-rd55p2"
            },
            {
                type: "system-design",
                title: "Implement a Sortable Table Column",
                url: "https://codesandbox.io/p/sandbox/determined-williams-6g4gl4?",
                topic: `
Q: Render the table with column headers
A: N/A

Q: Allow clicking a column header to sort data
A: N/A

Q: Toggle between ascending and descending order
A: N/A

Q: Render a sort indicator
A: N/A

  `,
                difficulty: "Easy",
                playground: "https://codesandbox.io/p/sandbox/determined-williams-6g4gl4?"
            },
            {
                type: "leetcode",
                title: "Merge Two Sorted Lists",
                url: "https://leetcode.com/problems/merge-two-sorted-lists",
                difficulty: "Easy"
            },
            {
                type: "leetcode",
                title: "Calculate Amount Paid in Taxes",
                url: "https://leetcode.com/problems/calculate-amount-paid-in-taxes",
                difficulty: "Easy"
            },

            // Medium
            {
                type: "leetcode",
                title: "Find All Anagrams in a String",
                url: "https://leetcode.com/problems/find-all-anagrams-in-a-string",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Course Schedule II",
                url: "https://leetcode.com/problems/course-schedule-ii",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Max Area of Island",
                url: "https://leetcode.com/problems/max-area-of-island",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Task Scheduler",
                url: "https://leetcode.com/problems/task-scheduler",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Remove Sub-Folders from the Filesystem",
                url: "https://leetcode.com/problems/remove-sub-folders-from-the-filesystem",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Implement Trie (Prefix Tree)",
                url: "https://leetcode.com/problems/implement-trie-prefix-tree",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Path With Minimum Effort",
                url: "https://leetcode.com/problems/path-with-minimum-effort",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Remove K Digits",
                url: "https://leetcode.com/problems/remove-k-digits",
                difficulty: "Medium"
            },
            {
                type: "leetcode",
                title: "Copy List with Random Pointer",
                url: "https://leetcode.com/problems/copy-list-with-random-pointer",
                difficulty: "Medium"
            },
            {
                type: "system-design",
                title: "React fundamentals 1",
                url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/bitly#high-level-design",
                topic: `
Q: What does useEffect do?
A: Runs side effects in function components. It is commonly used for data fetching, subscriptions, timers, and manually interacting with the DOM. It runs after render, and can be controlled with a dependency array.

Q: When does useEffect run?
A: By default, after every render. With an empty dependency array [], it runs once after the initial render. With dependencies, it runs whenever any dependency changes. It can also return a cleanup function that runs before the effect re-runs or when the component unmounts.

Q: What does useState do?
A: Adds state to a function component. It returns the current state value and a setter function that triggers a re-render when the state changes.

Q: What does useMemo do?
A: Memoizes the result of a computation. It recalculates the value only when its dependencies change. It is used to avoid expensive recalculations during re-renders.

Q: When should useMemo be used?
A: When a computation is expensive and the result is reused across renders, and when referential equality matters for performance optimizations.

`,
                difficulty: "Easy",
                playground: "https://leetcode.com/playground/3Du5jhPL"
            },
            {
                type: "system-design",
                title: "React fundamentals 2",
                url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/bitly#high-level-design",
                topic: `
Q: What does useCallback do?
A: Memoizes a function definition. It returns the same function reference between renders unless its dependencies change. This helps prevent unnecessary re-renders of child components that rely on function props.

Q: How is useCallback different from useMemo?
A: useCallback memoizes a function, while useMemo memoizes a value. useCallback(fn, deps) is equivalent to useMemo(() => fn, deps).

Q: What does useRef do?
A: Creates a mutable object with a .current property that persists across renders. Updating .current does not trigger a re-render.

Q: Common use cases for useRef?
A: Accessing DOM elements, storing mutable values like timers or previous state, and keeping values between renders without causing re-renders.

Q: What does useContext do?
A: Allows components to read values from a React Context without prop drilling. The component re-renders when the context value changes.

Q: What does useReducer do?
A: Manages complex state logic using a reducer function. It is useful when state transitions depend on previous state or when state logic becomes hard to manage with useState.

Q: What are hooks rules?
A: Hooks must be called at the top level of a function component or custom hook, not inside loops, conditions, or nested functions. Hooks must be called in the same order on every render.

Q: Why do dependency arrays matter?
A: They control when effects and memoized values update. Incorrect dependencies can cause stale values, infinite loops, or missed updates.

`,
                difficulty: "Easy",
                playground: "https://leetcode.com/playground/3Du5jhPL"
            },
            {
                type: "leetcode",
                title: "Step-By-Step Directions From a Binary Tree Node to Another",
                url: "https://leetcode.com/problems/step-by-step-directions-from-a-binary-tree-node-to-another",
                difficulty: "Medium"
            },
            // Replacements for removed premium questions
            {
                type: "leetcode",
                title: "Design Underground System",
                url: "https://leetcode.com/problems/design-underground-system",
                difficulty: "Medium"
            }, // replaces Design Hit Counter
            {
                type: "system-design",
                title: "Build a Controlled Form with Validation",
                url: "https://codesandbox.io/p/sandbox/staging-river-w6yqmp?",
                topic: `
Q: Implement a form with multiple controlled inputs
A: N/A

Q: Perform client-side validation
A: N/A

Q: Show field-level error messages
A: N/A

Q: Disable submit when form is invalid
A: N/A

Q: Maintain clean and scalable form state
A: N/A
    `,
                difficulty: "Easy",
                playground: "https://codesandbox.io/p/sandbox/staging-river-w6yqmp?"
            },
            {
                type: "leetcode",
                title: "Design Add and Search Words Data Structure",
                url: "https://leetcode.com/problems/design-add-and-search-words-data-structure",
                difficulty: "Medium"
            }, // replaces Design In-Memory File System
            {
                type: "leetcode",
                title: "Throne Inheritance",
                url: "https://leetcode.com/problems/throne-inheritance",
                difficulty: "Medium"
            },
            // Hard
            {
                type: "leetcode",
                title: "Minimum Window Substring",
                url: "https://leetcode.com/problems/minimum-window-substring",
                difficulty: "Hard"
            },
            {
                type: "system-design",
                title: "Implement a Modal Using Portals",
                url: "https://codesandbox.io/p/sandbox/adoring-forest-gcyypc?",
                topic: `
Q: Render modal outside the main DOM hierarchy
A: N/A

Q: Use React portals
A: N/A

Q: Close modal on Escape key press
A: N/A

Q: Trap focus within the modal
A: N/A

Q: Restore focus on close
A: N/A

Q: Clean up listeners on unmount
A: N/A
    `,
                difficulty: "Medium",
                playground: "https://codesandbox.io/p/sandbox/adoring-forest-gcyypc?"
            },
            {
                type: "leetcode",
                title: "Word Search II",
                url: "https://leetcode.com/problems/word-search-ii",
                difficulty: "Hard"
            },
            {
                type: "system-design",
                title: "Implement a Paginated Table",
                url: "https://codesandbox.io/p/sandbox/focused-bhabha-hmrgr4?",
                topic: `
Q: Render tabular data with pagination controls
A: N/A

Q: Fetch data page-by-page from an API
A: N/A

Q: Model pagination state cleanly
A: N/A

Q: Display loading and error states
A: N/A

Q: Handle page boundaries correctly
A: N/A

Q: Support column sorting
A: N/A

Q: Allow server-side pagination
A: N/A

Q: Prevent race conditions between requests
A: N/A
    `,
                difficulty: "Medium",
                playground: "https://codesandbox.io/p/sandbox/focused-bhabha-hmrgr4?"
            },
            {
                type: "leetcode",
                title: "Basic Calculator",
                url: "https://leetcode.com/problems/basic-calculator",
                difficulty: "Hard"
            },
            {
                type: "leetcode",
                title: "Parallel Courses III",
                url: "https://leetcode.com/problems/parallel-courses-iii",
                difficulty: "Hard"
            },
            {
                type: "leetcode",
                title: "Trapping Rain Water",
                url: "https://leetcode.com/problems/trapping-rain-water",
                difficulty: "Hard"
            },
            {
                type: "leetcode",
                title: "Merge k Sorted Lists",
                url: "https://leetcode.com/problems/merge-k-sorted-lists",
                difficulty: "Hard"
            },
            {
                type: "system-design",
                title: "Implement Infinite Scroll",
                url: "https://codesandbox.io/p/sandbox/funny-shannon-sklqfw?",
                topic: `
Q: Load additional data when user scrolls near the bottom
A: N/A

Q: Use IntersectionObserver
A: N/A

Q: Prevent duplicate fetches
A: N/A

Q: Display graceful loading states
A: N/A

Q: Handle end-of-list conditions
A: N/A
    `,
                difficulty: "Medium",
                playground: "https://codesandbox.io/p/sandbox/funny-shannon-sklqfw?"
            },
            {
                type: "system-design",
                title: "Build a Virtualized List",
                url: "https://codesandbox.io/p/sandbox/silly-swanson-t5dg34?",
                topic: `
Q: Render a list with 10,000 or more rows
A: N/A

Q: Avoid rendering all rows at once
A: N/A

Q: Use windowing based on scroll position
A: N/A

Q: Maintain correct scroll height
A: N/A

Q: Support dynamic row heights
A: N/A

Q: Support sticky headers
A: N/A
    `,
                difficulty: "Hard",
                playground: "https://codesandbox.io/p/sandbox/silly-swanson-t5dg34?"
            }
            ,
            {
                type: "system-design",
                title: "Implement loadUserData",
                url: "https://codesandbox.io/p/sandbox/modest-wave-8w694k",
                topic: `
Q: Implement a function loadUserData that calls fetchUser and fetchAccount
A: N/A

Q: Run both API requests in parallel
A: N/A

Q: Resolve with an object containing both results in the shape { user, account }
A: N/A

Q: Reject with the original error if either API call fails
A: N/A

Q: Do not swallow or transform errors
A: N/A

Q: Do not call either API more than once
A: N/A

Q: Ensure the function returns a Promise
A: N/A
    `,
                difficulty: "Medium",
                playground: "https://codesandbox.io/p/sandbox/modest-wave-8w694k"
            }

        ];


        // Convenience arrays
        const leetcode_items = study_items.filter(i => i.type === 'leetcode');
        const leetcode_links = leetcode_items.map(i => i.url);
        const system_design_items = study_items.filter(i => i.type === 'system-design');

        // Back-compat alias: reference -> url
        system_design_items.forEach(i => {
            if (!i.reference) i.reference = i.url;
        });
        system_design_items.forEach((item, idx) => {
            if (item.playground && !/\d+$/.test(item.playground)) {
                item.playground = `${item.playground}${idx + 1}`;
            }
        });

        /* ----------------------------------------------
   Unified SRS items (LC + System-Design), interleaved
---------------------------------------------- */
        function getPlaygroundId(u) {
            const str = u || '';
            const leet = str.match(/\/playground\/([^\/?#]+)/);
            if (leet) return leet[1];

            // Codesandbox URLs: https://codesandbox.io/p/sandbox/<id>
            const csFull = str.match(/codesandbox\.io\/p\/sandbox\/([^\/?#]+)/);
            if (csFull) return `cs-${csFull[1]}`;

            // When only the pathname is available
            const csPath = str.match(/\/p\/sandbox\/([^\/?#]+)/);
            if (csPath) return `cs-${csPath[1]}`;

            return null;
        }

        // Build SRS queue in the exact order defined in study_items
        const srs_items = study_items
        .map((item) => {
            if (item.type === 'leetcode') {
                const slugFromUrl = (() => {
                    try {
                        const u = new URL(item.url, window.location.href);
                        const parts = u.pathname.split('/').filter(Boolean);
                        const idx = parts.indexOf('problems');
                        if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
                    } catch (_) {}
                    const parts = String(item.url || '').split('/').filter(Boolean);
                    return parts[parts.length - 1] || null;
                })();
                return {
                    key: slugFromUrl,
                    nav: item.url,
                    kind: 'leetcode',
                    title: item.title
                };
            }
            if (item.type === 'system-design' && item.playground) {
                const pid = getPlaygroundId(item.playground);
                return {
                    key: pid ? `sd:${pid}` : `sd:${item.playground}`,
                    nav: item.playground,
                    kind: 'system-design',
                    title: item.title,
                    url: item.url // keep for toast
                };
            }
            return null;
        })
        .filter(Boolean);

        /* ----------------------------------------------
     Timer globals
  ---------------------------------------------- */
        let remainingTimeToday = DAILY_TIME_LIMIT_SECONDS;
        let timerIntervalId = null;
        let timerDisplayElement = null;
        let isPageVisible = true;
        let isWindowFocused = true;

        // For Easy button visibility logic
        let mainDetailsElement = null;
        let easyButton = null;

        // Per-item timing and UI refs (PERSISTED)
        let perQuestionSpentSeconds = 0; // internal only; no UI
        let perQuestionTargetSeconds = 7 * 60; // default Medium; SD will override
        let solutionCountdownEl = null;
        let difficultyBadgeEl = null;
        let currentKeyCached = null;
        let sdToastLastItem = null;

        /* ----------------------------------------------
     Utility / Timer functions
  ---------------------------------------------- */
        function updateEasyButtonVisibility() {
            if (!easyButton) return;
            if (!isWindowFocused || window.location.pathname.includes('/submissions/')) {
                // Show a disabled look but keep it clickable
                easyButton.style.opacity = '0.45';
                easyButton.style.filter = 'grayscale(0.4)';
                easyButton.style.cursor = 'not-allowed';
            } else {
                // easyButton.style.opacity = '';
                // easyButton.style.filter = '';
                // easyButton.style.cursor = 'pointer';
            }
        }

        function getDateString() {
            const now = new Date();
            return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        }

        function formatTime(totalSeconds) {
            if (totalSeconds < 0) totalSeconds = 0;
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            return [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
        }

        function formatMinSec(totalSeconds) {
            if (totalSeconds < 0) totalSeconds = 0;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return [minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
        }

        // ---------- Per-item persistence (Tampermonkey storage) ----------
        function pq_getMap() {
            return storageCache.perQuestionTimers || {};
        }

        async function pq_saveMap(map) {
            storageCache.perQuestionTimers = map;
            await gmWriteJSON('lc_perQuestionTimers', map);
        }

        function pq_load(key) {
            const map = pq_getMap();
            return map[key] || null;
        }

        async function pq_save(key, spent, target) {
            const map = pq_getMap();
            map[key] = {
                spent: Number(spent) || 0,
                target: Number(target) || 0
            };
            await pq_saveMap(map);
        }

        async function pq_reset(key) {
            const map = pq_getMap();
            delete map[key];
            await pq_saveMap(map);
        }

        // ---------- Daily timer (GM.* cross-domain) ----------
        async function loadAndResetDailyTimer() {
            const today = getDateString();
            const lastDate = await GM.getValue('leetcodeTimer_lastDate', null);
            let savedRemainingTime = parseInt(await GM.getValue('leetcodeTimer_remainingTime', '0'), 10);

            if (lastDate !== today) {
                remainingTimeToday = DAILY_TIME_LIMIT_SECONDS;
                await GM.setValue('leetcodeTimer_lastDate', today);
                await GM.setValue('leetcodeTimer_remainingTime', remainingTimeToday.toString());
            } else {
                remainingTimeToday = Math.min(isNaN(savedRemainingTime) ? 0 : savedRemainingTime, DAILY_TIME_LIMIT_SECONDS);
                if (remainingTimeToday < 0) remainingTimeToday = 0;
            }
        }

        async function saveTimerProgress() {
            await GM.setValue('leetcodeTimer_remainingTime', remainingTimeToday.toString());
        }

        function updateTimerDisplay() {
            if (!timerDisplayElement) return;
            if (remainingTimeToday <= 0) {
                timerDisplayElement.innerText = "Time's up!";
                timerDisplayElement.style.color = 'green';
            } else {
                timerDisplayElement.innerText = `${formatTime(remainingTimeToday)}`;
                timerDisplayElement.style.color = '#aed6f1';
            }
        }

        function updatePerQuestionDisplays() {
            if (solutionCountdownEl) {
                const remaining = Math.max(perQuestionTargetSeconds - perQuestionSpentSeconds, 0);
                if (remaining > 0) {
                    solutionCountdownEl.innerText = `Solution unlock in: ${formatMinSec(remaining)}`;
                    solutionCountdownEl.style.color = '#ffda79';
                } else {
                    solutionCountdownEl.innerText = `You can check the solution now 🎉`;
                    solutionCountdownEl.style.color = '#8aff8a';
                }
                _setTabDisabled(remaining > 0);
            }
            updateSystemDesignToastLockUI();
        }

        function getCurrentKey() {
            const parts = window.location.pathname.split('/');
            const idx = parts.indexOf('problems');
            if (isLeetcode && idx !== -1) {
                return parts[idx + 1]; // LC slug
            }
            const pgId = getPlaygroundId(window.location.href);
            if (pgId) return `sd:${pgId}`;
            return null;
        }

        function getKeyFromUrl(url) {
            try {
                const u = new URL(url, window.location.href);
                const parts = u.pathname.split('/');
                const idx = parts.indexOf('problems');
                if (idx !== -1) return parts[idx + 1];
                const pgId = getPlaygroundId(u.href);
                if (pgId) return `sd:${pgId}`;
            } catch (_) {}
            return null;
        }

        function getLeetcodeSlugFromLink(url) {
            try {
                const u = new URL(url, window.location.href);
                const parts = u.pathname.split('/');
                const idx = parts.indexOf('problems');
                if (idx !== -1) return parts[idx + 1];
            } catch (_) {}
            return null;
        }

        function isSystemDesignCurrent() {
            const pgId = getPlaygroundId(window.location.href);
            return Boolean(pgId) || String(getCurrentKey() || '').startsWith('sd:');
        }

        // detect difficulty from page, special-case SD; restore stored spent/target when available
        function detectDifficultyAndTarget() {
            // Defaults
            let difficulty = 'Medium';
            const uniformTargetSeconds = 6 * 60;
            let target = uniformTargetSeconds;
            const playgroundId = getPlaygroundId(window.location.href);

            // --- System Design playgrounds (LeetCode or CodeSandbox): derive difficulty from your study list ---
            if (playgroundId) {
                const sdItem = (system_design_items || []).find(sd => getPlaygroundId(sd.playground) === playgroundId);
                difficulty = (sdItem && sdItem.difficulty) ? sdItem.difficulty : 'Easy';
            } else if (isLeetcode) {
                // --- Regular LeetCode problem pages ---
                try {
                    const diffEl = document.querySelector('[class*=\"text-difficulty-\"], .text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard');
                    const txt = (diffEl?.textContent || '').trim();
                    if (/easy/i.test(txt)) difficulty = 'Easy';
                    else if (/hard/i.test(txt)) difficulty = 'Hard';
                    else if (/medium/i.test(txt)) difficulty = 'Medium';
                    else {
                        const cls = diffEl?.className || '';
                        if (/text-difficulty-easy/i.test(cls)) difficulty = 'Easy';
                        else if (/text-difficulty-hard/i.test(cls)) difficulty = 'Hard';
                        else if (/text-difficulty-medium/i.test(cls)) difficulty = 'Medium';
                    }
                } catch (_) {
                    /* noop */
                }
            }

            // Uniform target regardless of difficulty
            target = uniformTargetSeconds;

            // Prefer stored values for this key if present
            const key = getCurrentKey();
            const stored = key ? pq_load(key) : null;

            perQuestionTargetSeconds = (stored?.target > 0) ? stored.target : target;
            perQuestionSpentSeconds = (stored?.spent > 0) ? stored.spent : 0;

            if (difficultyBadgeEl) {
                difficultyBadgeEl.textContent = difficulty; // e.g., "Easy", "Medium", "Hard"
                difficultyBadgeEl.className = `relative inline-flex items-center justify-center text-caption px-2 py-1 gap-1 rounded-full bg-fill-secondary ${
            difficulty === 'Easy' ? 'text-difficulty-easy' :
                difficulty === 'Hard' ? 'text-difficulty-hard' :
                'text-difficulty-medium'
            }`;
            }
        }


        function shouldCountDown() {
            return isPageVisible && isWindowFocused;
        }

        /**
         * decouple per-item countdown from daily cap:
         * - per-item always increments while visible/focused.
         * - daily timer decrements until 0, then stops (interval continues).
         */
        function startDailyTimer() {
            if (timerIntervalId) clearInterval(timerIntervalId);

            timerIntervalId = setInterval(() => {
                if (shouldCountDown()) {
                    // Per-item time always progresses
                    perQuestionSpentSeconds++;

                    // Persist per-item progress per key every tick
                    if (currentKeyCached) {
                        void pq_save(currentKeyCached, perQuestionSpentSeconds, perQuestionTargetSeconds);
                    }

                    // Daily time decrements only if we have time left
                    if (remainingTimeToday > 0) {
                        remainingTimeToday--;
                        void saveTimerProgress();
                    }
                }

                // Always refresh UI
                updateTimerDisplay();
                updatePerQuestionDisplays();
            }, 1000);
        }

        /* ----------------------------------------------
     Visibility/Focus events
  ---------------------------------------------- */
        document.addEventListener('visibilitychange', () => {
            isPageVisible = !document.hidden;
            updateEasyButtonVisibility();
        });

        window.addEventListener('focus', () => {
            isWindowFocused = true;
            updateEasyButtonVisibility();
        });

        window.addEventListener('blur', () => {
            isWindowFocused = false;
            updateEasyButtonVisibility();
        });

        /* ----------------------------------------------
     SRS (Again/Good/Easy) config
  ---------------------------------------------- */
        const BUTTONS = ['Again', 'Good', 'Easy'];
        const BUTTON_COLORS = {
            'Again': 'red',
            'Good': 'orange',
            'Easy': 'green'
        };
        const moveSteps = {
            'Again': 1,
            'Good': 3,
            'Easy': 5
        };
        const BASE_WINDOW = 10;
        const EASY_THRESHOLD = 2;
        const EASY_COMPLETION = 3; // weighted target: Easy=1, Good=0.5

        function normalizeStatuses(raw) {
            if (Array.isArray(raw)) {
                const filtered = raw.filter(v => typeof v === 'string' && v.trim());
                const unchanged = filtered.length === raw.length && filtered.every((v, idx) => v === raw[idx]);
                return unchanged ? raw : filtered;
            }
            if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
            return [];
        }

        function loadProgress() {
            const progress = storageCache.leetcodeSR || {};
            let mutated = false;

            Object.keys(progress).forEach(key => {
                const normalized = normalizeStatuses(progress[key]);
                if (normalized !== progress[key]) {
                    progress[key] = normalized;
                    mutated = true;
                }
            });

            if (mutated) {
                storageCache.leetcodeSR = progress;
                void gmWriteJSON('leetcodeSR', progress);
            }

            return progress;
        }

        async function saveProgress(key, status) {
            const progress = loadProgress();
            const normalized = normalizeStatuses(progress[key]);
            normalized.push(status);
            progress[key] = normalized;
            storageCache.leetcodeSR = progress;
            await gmWriteJSON('leetcodeSR', progress);
        }

        function calculateCompletionScore(key) {
            const progress = loadProgress();
            const statuses = normalizeStatuses(progress[key]);
            let score = 0;
            for (const status of statuses) {
                if (status === 'Easy') score += 1;
                else if (status === 'Good') score += 0.5;
            }
            return score;
        }

        function isCompleted(key) {
            return calculateCompletionScore(key) >= EASY_COMPLETION;
        }

        function getQueue() {
            let queue = storageCache.leetcodeQueue;
            if (typeof queue === 'string') {
                try {
                    queue = JSON.parse(queue);
                } catch (_) {
                    queue = [];
                }
            }
            if (!Array.isArray(queue)) queue = [];
            queue = [...queue];
            return queue.filter(item => item && item.key && !isCompleted(item.key));
        }

        async function setQueue(queue) {
            let arr = queue;
            if (typeof arr === 'string') {
                try {
                    arr = JSON.parse(arr);
                } catch (_) {
                    arr = [];
                }
            }
            const filtered = (Array.isArray(arr) ? arr : []).filter(item => item && item.key && !isCompleted(item.key));
            storageCache.leetcodeQueue = filtered;
            await gmWriteJSON('leetcodeQueue', filtered);
        }

        function getCurrentLink() {
            return storageCache.leetcodeCurrent;
        }

        async function setCurrentLink(url) {
            storageCache.leetcodeCurrent = url;
            await GM.setValue('leetcodeCurrent', url);
        }

        function findNavByKey(key) {
            const item = srs_items.find(it => it.key === key);
            return item ? item.nav : null;
        }

        function pickNextNav() {
            const queue = getQueue();

            // Only allow queue items that belong to the current site
            for (const item of queue) {
                const nav = findNavByKey(item.key);
                if (!nav) continue;

                // If we are on LeetCode, skip system-design items
                if (isLeetcode && String(item.key).startsWith('sd:')) continue;

                return nav;
            }
            const nextLeetcode = leetcode_links
            .map(link => ({
                slug: getLeetcodeSlugFromLink(link),
                nav: link
            }))
            .filter(item => item.slug)
            .filter(item => !isCompleted(item.slug));

            if (nextLeetcode.length > 0) {
                return nextLeetcode[0].nav;
            }
            if (nextLeetcode) return nextLeetcode.nav;

            const remaining = srs_items.find(it => !isCompleted(it.key));
            return remaining ? remaining.nav : null;
        }

        function getWindowSize() {
            const progress = loadProgress();
            let windowSize = BASE_WINDOW;

            const firstWindowKeys = srs_items
            .slice(0, windowSize)
            .map(it => it.key)
            .filter(key => !isCompleted(key));

            const easyCount = firstWindowKeys.reduce((acc, key) => {
                return acc + (progress[key]?.filter(s => s === 'Easy').length || 0);
            }, 0);

            if (easyCount >= EASY_THRESHOLD) windowSize += 2;
            return Math.min(windowSize, srs_items.length);
        }

        // ---------- Lock/Unlock "Solutions" & "Submissions" tabs ----------
        function _setTabDisabled(hidden) {
            const ids = ['solutions_tab', 'submissions_tab'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const tab = el.closest('[role="tab"], .flexlayout__tab_button, .flexlayout__tab_button_content') || el;
                if (hidden) {
                    tab.style.display = 'none';
                } else {
                    tab.style.display = '';
                }
            });
        }

        async function setCurrentLinkIfIncomplete(url) {
            const key = getKeyFromUrl(url);
            if (key && isCompleted(key)) {
                return;
            }
            await setCurrentLink(url);
        }
        async function goToNextProblem(buttonType) {
            const key = getCurrentKey();
            console.log('📢[test.js:896]: key: ', key);
            if (!key) return;

            // 1) Record SRS status
            await saveProgress(key, buttonType);
            // 1b) Reset checklist for current SD item
            await resetSystemDesignChecklistForKey(key);

            // 2) Reset solution unlock for this key
            perQuestionSpentSeconds = 0;
            await pq_save(key, 0, perQuestionTargetSeconds);
            updatePerQuestionDisplays();

            // 3) Queue / cooldown logic
            let queue = getQueue().filter(item => !isCompleted(item.key));
            console.log('📢[test.js:912]: isCompleted(key): ', isCompleted(key));
            const steps = moveSteps[buttonType] || 1;
            if (!isCompleted(key)) {
                queue.push({
                    key,
                    cooldown: steps
                });
            }
            await setQueue(queue);

            queue = queue
                .map(item => ({
                ...item,
                cooldown: item.cooldown - 1
            }))
                .filter(item => item.cooldown > 0);
            await setQueue(queue);

            // 4) Try SRS next item
            const remainingItems = srs_items.filter(it => !isCompleted(it.key));
            let nextNav = null;

            for (const it of remainingItems) {
                if (!queue.some(q => q.key === it.key)) {
                    nextNav = it.nav;
                    break;
                }
            }

            // 5) LeetCode fallback
            if (!nextNav && isLeetcode) {
                const nextLc = leetcode_links
                .map(link => ({
                    slug: getLeetcodeSlugFromLink(link),
                    nav: link
                }))
                .filter(item => item.slug)
                .find(item => !isCompleted(item.slug));

                if (nextLc) {
                    nextNav = nextLc.nav;
                }
            }

            if (!nextNav) {
                alert('All items completed!');
                return;
            }

            // 6) Persist safely and navigate once
            await setCurrentLinkIfIncomplete(nextNav);
            window.location.href = nextNav;
        }
        /* ------------------------------------------
     Small auto popup for system-design playgrounds
  ------------------------------------------ */
        function isSolutionLocked() {
            return Math.max(perQuestionTargetSeconds - perQuestionSpentSeconds, 0) > 0;
        }

        function updateSystemDesignToastLockUI() {
            const toast = document.getElementById('sd-mini-toast');
            if (!toast) return;
            const locked = isSolutionLocked();

            // Toggle a simple class for styles and affordance
            toast.classList.toggle('locked', locked);

            // If unlocked, auto open the first question once
            if (!locked && !toast.__autoOpened) {
                const first = toast.querySelector('.sd-collapsible');
                if (first && !first.open) first.open = true;
                toast.__autoOpened = true;
            }

            // If re-locked for any reason, ensure all are closed
            if (locked) {
                toast.querySelectorAll('.sd-collapsible[open]').forEach(d => {
                    d.open = false;
                });
            }
        }

        async function resetSystemDesignChecklistForKey(key) {
            if (!key || !String(key).startsWith('sd:')) return;
            const checklistKey = `sd_mini_toast_checks_${key}`;
            await gmWriteJSON(checklistKey, {});
            const toast = document.getElementById('sd-mini-toast');
            if (toast) {
                toast.querySelectorAll('.sd-check input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                    const label = cb.closest('.sd-check');
                    if (label) label.classList.remove('checked');
                });
            }
        }

        function ensureSystemDesignToastLauncher() {
            let btn = document.getElementById('sd-toast-launcher');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'sd-toast-launcher';
                btn.textContent = 'SD notes';
                Object.assign(btn.style, {
                    position: 'fixed',
                    top: '14px',
                    right: '20px',
                    zIndex: 10000,
                    background: '#181818',
                    color: '#eaeaea',
                    border: '1px solid #444',
                    borderRadius: '999px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 6px 14px rgba(0,0,0,0.45)',
                    opacity: '0.9'
                });
                btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
                btn.addEventListener('mouseleave', () => btn.style.opacity = '0.85');
                btn.addEventListener('click', async () => {
                    if (sdToastLastItem) {
                        await showSystemDesignToast(sdToastLastItem);
                    }
                });
                document.body.appendChild(btn);
            }
            return btn;
        }

        async function showSystemDesignToast(item) {
            if (!item) return;
            if (document.getElementById('sd-mini-toast')) return;
            sdToastLastItem = item;
            const launcher = ensureSystemDesignToastLauncher();
            launcher.style.display = 'none';

            // Inject styles once
            const STYLE_ID = 'sd-mini-toast-style';
            if (!document.getElementById(STYLE_ID)) {
                const style = document.createElement('style');
                style.id = STYLE_ID;
                style.textContent = `
      #sd-mini-toast {
        position: fixed; top: 300px; right: 20px; z-index: 10000;
        background: rgba(28,28,28,.96); color: #eee; border: 1px solid #3a3a3a;
        border-radius: 12px; padding: 16px 18px; max-width: 440px;
        box-shadow: 0 8px 28px rgba(0,0,0,.5);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        animation: sdtoast-in .16s ease-out;
      }
      #sd-mini-toast h3 { margin: 0 0 10px 0; font-size: 18px; line-height: 1.25; color:#cfcfcf; }
      #sd-mini-toast .sd-topic { font-size: 15px; color: #cfcfcf; margin: 0 0 12px 0; white-space: pre-line; }
      #sd-mini-toast .sd-qa details {
        border: 1px solid #3a3a3a; border-radius: 10px; padding: 10px 12px;
        margin: 10px 0; background: rgba(255,255,255,0.02);
      }
      #sd-mini-toast .sd-qa {
        max-height: 25vh; overflow-y: auto; padding-right: 6px;
      }
      #sd-mini-toast .sd-qa summary { cursor: pointer; font-weight: 600; font-size: 14px; outline: none; list-style: none; }
      #sd-mini-toast .sd-qa summary::-webkit-details-marker { display: none; }
      #sd-mini-toast .sd-check { display: inline-flex; align-items: center; gap: 8px; }
      #sd-mini-toast .sd-check.checked span { text-decoration: line-through; color: #8aff8a; }
      #sd-mini-toast .sd-check input { accent-color: #8aff8a; }
      #sd-mini-toast .sd-qa .sd-answer { margin-top: 8px; font-size: 14px; color: #e3e3e3; }
      #sd-mini-toast .sd-qa pre {
        margin: 8px 0 0 0; padding: 8px 10px; overflow: auto; font-size: 12px;
        border: 1px solid #3a3a3a; border-radius: 8px; background: #111; color: #ddd;
      }
      #sd-mini-toast .sd-links a {
        font-size: 14px; text-decoration: none; border: 1px solid #555;
        border-radius: 10px; padding: 7px 10px; margin-right: 8px;
        color: #eaeaea; display: inline-block;
      }
      #sd-mini-toast .sd-links a:hover { background: #2a2a2a; }
      /* Button style to match links */
      #sd-mini-toast .sd-links button {
        font-size: 14px; border: 1px solid #555; background: transparent;
        border-radius: 10px; padding: 7px 10px; margin-right: 8px;
        color: #eaeaea; display: inline-block; cursor: pointer;
      }
      #sd-mini-toast .sd-links button:hover { background: #2a2a2a; }

      #sd-mini-toast .sd-x {
        position: absolute; top: 8px; right: 10px; cursor: pointer;
        color: #aaa; font-size: 18px; line-height: 1; user-select: none;
      }
      /* locked state styles */
      #sd-mini-toast.locked .sd-qa summary {
        cursor: not-allowed;
        opacity: 0.65;
      }
      #sd-mini-toast .sd-lock-hint {
        margin-top: 6px; font-size: 12px; color: #ffda79;
      }
      #sd-mini-toast.sd-dragging { user-select: none; }
      @keyframes sdtoast-in { from { transform: translateY(-6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    `;
                document.head.appendChild(style);
            }

            const box = document.createElement('div');
            box.id = 'sd-mini-toast';
            const POSITION_KEY = 'sd_mini_toast_pos';
            const FORCE_RIGHT_POSITION = true;
            const DEFAULT_TOAST_TOP = 350;
            const DEFAULT_TOAST_RIGHT = 20;

            const isUrl = s => /^https?:\/\//i.test(String(s).trim());
            const esc = s => String(s).replace(/[&<>"']/g, c => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            } [c]));
            const linkify = s => esc(s).replace(
                /(https?:\/\/[^\s)]+)|(\bwww\.[^\s)]+)/gi,
                m => `<a href="${m.startsWith('http') ? m : 'http://' + m}" target="_blank" rel="noopener noreferrer">${m}</a>`
            );

            const toastKey = getCurrentKey() || getKeyFromUrl(item.nav || item.url || '') || (() => {
                const pg = getPlaygroundId(item.nav || item.url || '');
                return pg ? `sd:${pg}` : null;
            })();
            const checklistKey = toastKey ? `sd_mini_toast_checks_${toastKey}` : null;
            const savedChecklist = checklistKey ? await gmReadJSON(checklistKey, {}) : {};

            const answersFromArray = Array.isArray(item.answers) ? item.answers : [];
            const topicText = String(item.topic || '');

            function parseQAPairs(text) {
                const pairs = [];
                const qaRegex = /(?:^\s*|\n\s*)Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*?)(?=\n\s*Q:|\n?\s*$)/gi;
                let m;
                while ((m = qaRegex.exec(text)) !== null) {
                    const q = m[1].trim();
                    const a = m[2].trim();
                    if (q || a) pairs.push({
                        q,
                        a
                    });
                }
                if (pairs.length) return pairs;

                const introSplit = text.split(/\s*\d+\)\s*/);
                const intro = introSplit[0].trim();
                const segments = text.match(/(\d+\)\s*[\s\S]*?)(?=\s*\d+\)|\s*$)/g) || [];
                segments.forEach(seg => {
                    const cleaned = seg.replace(/^\d+\)\s*/, '');
                    const parts = cleaned.split(/\s*A:\s*/);
                    const q = (parts[0] || '').trim().replace(/^Q:\s*/i, '');
                    const a = (parts.slice(1).join(' A: ') || '').trim();
                    if (q || a) pairs.push({
                        q,
                        a
                    });
                });

                if (!pairs.length && intro) pairs.push({
                    q: intro,
                    a: ''
                });
                return pairs;
            }

            const qaPairs = parseQAPairs(topicText);
            const isDiagramQ = q => /draw (high level|final) design/i.test(q);

            const qaHtml = qaPairs.map((pair, idx) => {
                const hasArrayAnswer = idx < answersFromArray.length && answersFromArray[idx] != null;
                const answerRaw = hasArrayAnswer ? String(answersFromArray[idx]) : String(pair.a || '');
                const checked = !!savedChecklist[String(idx)];

                let answerRendered = '';
                if (isDiagramQ(pair.q)) {
                    if (isUrl(answerRaw)) {
                        answerRendered = `<div class="sd-answer"><a href="${answerRaw}" target="_blank" rel="noopener noreferrer">${esc(answerRaw)}</a></div>`;
                    } else {
                        answerRendered = `<pre>${esc(answerRaw || 'No diagram provided.')}</pre>`;
                    }
                } else {
                    const content = answerRaw.trim();
                    if (!content) {
                        answerRendered = `<div class="sd-answer">No answer provided.</div>`;
                    } else {
                        answerRendered = `<div class="sd-answer">${linkify(content)}</div>`;
                    }
                }

                return `<details class="sd-collapsible">
        <summary><label class="sd-check${checked ? ' checked' : ''}"><input type="checkbox" data-idx="${idx}" ${checked ? 'checked' : ''}/> <span>${idx + 1}. ${esc(pair.q || 'Question')}</span></label></summary>
        ${answerRendered}
      </details>`;
            }).join('');

            const headerIntro = topicText.split(/\s*Q:\s*|\s*\d+\)\s*/)[0].trim();
            const formattedTopicHeader = [headerIntro, ''].filter(Boolean).join('\n\n');

            box.innerHTML = `
    <div class="sd-x" title="Close" aria-label="Close">✕</div>
    <h3>${esc(item.title || 'System Design')}</h3>
  <div class="sd-topic">${esc(formattedTopicHeader)}</div>
  <div class="sd-qa">${qaHtml}</div>
  <div class="sd-links">
      ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">Reference</a>` : ''}
      ${item.playground ? `<a href="${item.playground}" target="_blank" rel="noopener noreferrer">Playground</a>` : ''}
      <button type="button" id="sd-copy-qs">Copy questions</button>
    </div>
  `;

            const dragHandle = box.querySelector('h3') || box;
            dragHandle.style.cursor = FORCE_RIGHT_POSITION ? 'default' : 'grab';

            const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
            const applyDefaultPosition = () => {
                box.style.top = `${DEFAULT_TOAST_TOP}px`;
                box.style.right = `${DEFAULT_TOAST_RIGHT}px`;
                box.style.left = 'auto';
            };

            async function applyStoredPosition() {
                if (FORCE_RIGHT_POSITION) {
                    applyDefaultPosition();
                    return;
                }
                const saved = await gmReadJSON(POSITION_KEY, null);
                const savedTop = saved && typeof saved.top !== 'undefined' ? parseFloat(saved.top) : null;
                const savedLeft = saved && typeof saved.left !== 'undefined' ? parseFloat(saved.left) : null;
                if (Number.isFinite(savedTop) && Number.isFinite(savedLeft)) {
                    box.style.top = `${savedTop}px`;
                    box.style.left = `${savedLeft}px`;
                    box.style.right = 'auto';
                }
            }

            function ensureToastInViewport() {
                if (FORCE_RIGHT_POSITION) {
                    applyDefaultPosition();
                    return;
                }
                const rect = box.getBoundingClientRect();
                const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
                const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
                const nextLeft = clamp(rect.left, 8, maxLeft);
                const nextTop = clamp(rect.top, 8, maxTop);
                box.style.left = `${nextLeft}px`;
                box.style.top = `${nextTop}px`;
                box.style.right = 'auto';
            }

            let dragState = null;
            function onDrag(e) {
                if (FORCE_RIGHT_POSITION) return;
                if (!dragState) return;
                const { offsetX, offsetY } = dragState;
                const newLeft = clamp(e.clientX - offsetX, 8, Math.max(8, window.innerWidth - box.offsetWidth - 8));
                const newTop = clamp(e.clientY - offsetY, 8, Math.max(8, window.innerHeight - box.offsetHeight - 8));
                box.style.left = `${newLeft}px`;
                box.style.top = `${newTop}px`;
                box.style.right = 'auto';
            }

            function endDrag() {
                if (FORCE_RIGHT_POSITION) return;
                if (!dragState) return;
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', endDrag);
                box.classList.remove('sd-dragging');
                dragHandle.style.cursor = 'grab';
                dragState = null;
                const topVal = parseFloat(box.style.top);
                const leftVal = parseFloat(box.style.left);
                if (Number.isFinite(topVal) && Number.isFinite(leftVal)) {
                    void gmWriteJSON(POSITION_KEY, {
                        top: topVal,
                        left: leftVal
                    });
                }
            }

            function startDrag(e) {
                if (FORCE_RIGHT_POSITION) return;
                if (e.button !== 0) return;
                dragState = {
                    offsetX: e.clientX - box.getBoundingClientRect().left,
                    offsetY: e.clientY - box.getBoundingClientRect().top
                };
                dragHandle.style.cursor = 'grabbing';
                box.classList.add('sd-dragging');
                document.addEventListener('mousemove', onDrag);
                document.addEventListener('mouseup', endDrag);
                e.preventDefault();
            }

            dragHandle.addEventListener('mousedown', startDrag);

            const closeBtn = box.querySelector('.sd-x');
            closeBtn.onclick = () => {
                endDrag();
                window.removeEventListener('resize', ensureToastInViewport);
                box.remove();
                launcher.style.display = 'inline-flex';
            };

            applyDefaultPosition();
            await applyStoredPosition();
            document.body.appendChild(box);
            ensureToastInViewport();
            window.addEventListener('resize', ensureToastInViewport);

            function persistChecklist(idx, val) {
                if (!checklistKey) return;
                const key = String(idx);
                savedChecklist[key] = val;
                void gmWriteJSON(checklistKey, savedChecklist);
            }

            function syncCheck(cb) {
                const label = cb.closest('.sd-check');
                if (!label) return;
                label.classList.toggle('checked', cb.checked);
            }

            box.querySelectorAll('.sd-check input[type="checkbox"]').forEach(cb => {
                syncCheck(cb);
                cb.addEventListener('change', () => {
                    const idx = cb.getAttribute('data-idx');
                    persistChecklist(idx, cb.checked);
                    syncCheck(cb);
                });
            });

            // Copy questions handler
            const copyBtn = box.querySelector('#sd-copy-qs');
            if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                    const summaries = Array.from(box.querySelectorAll('.sd-collapsible > summary'));

                    const text = summaries
                    .map(sm => sm.textContent.replace(/^\s*\d+\.\s*/, '').trim())
                    .filter(Boolean)
                    .map(q => `Q: ${q}\nA:`)
                    .join('\n\n');

                    async function fallbackCopy(t) {
                        const ta = document.createElement('textarea');
                        ta.value = t;
                        ta.setAttribute('readonly', '');
                        ta.style.position = 'absolute';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        try {
                            document.execCommand('copy');
                        } finally {
                            document.body.removeChild(ta);
                        }
                    }

                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(text);
                        } else {
                            await fallbackCopy(text);
                        }
                        const old = copyBtn.textContent;
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = old;
                        }, 1200);
                    } catch (e) {
                        const old = copyBtn.textContent;
                        copyBtn.textContent = 'Copy failed';
                        setTimeout(() => {
                            copyBtn.textContent = old;
                        }, 1400);
                    }
                });
            }

            // block opening while locked
            function bindLockHandlers() {
                const summaries = box.querySelectorAll('.sd-collapsible > summary');
                summaries.forEach(sm => {
                    sm.addEventListener('click', e => {
                        const locked = typeof isSolutionLocked === 'function' && isSolutionLocked();
                        const isCheckbox = e.target && e.target.matches('input[type="checkbox"]');

                        if (locked && !isCheckbox) {
                            e.preventDefault();
                            e.stopPropagation();

                            let hint = sm.parentElement.querySelector('.sd-lock-hint');
                            if (!hint) {
                                hint = document.createElement('div');
                                hint.className = 'sd-lock-hint';
                                hint.textContent = 'Unlock the solution to expand';
                                sm.parentElement.appendChild(hint);
                            }
                            hint.style.opacity = '1';
                            clearTimeout(hint.__t);
                            hint.__t = setTimeout(() => {
                                hint.style.opacity = '0.0';
                            }, 1400);
                            return;
                        }

                        if (locked) {
                            return;
                        }

                        const details = sm.parentElement;
                        if (isCheckbox) {
                            if (details) details.open = true;
                            return; // keep checkbox behavior
                        }
                        e.preventDefault(); // make whole summary toggle
                        if (details) details.open = !details.open;
                    }, true);
                });
            }
            bindLockHandlers();

            // initial lock state
            if (typeof updateSystemDesignToastLockUI === 'function') {
                updateSystemDesignToastLockUI();
            }
        }




        /* ------------------------------------------
     UI: container + progress + buttons
  ------------------------------------------ */

        function createUI() {
            const container = document.createElement('div');
            container.id = 'lc-srs-container';
            container.style.position = 'fixed';
            container.style.top = '0px';
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
            container.style.background = 'rgba(24, 24, 24, 0.95)';
            container.style.border = '1px solid #444';
            container.style.padding = '8px 12px 16px';
            container.style.zIndex = 9999;
            container.style.borderRadius = '12px';
            container.style.boxShadow = '0 8px 22px rgba(0,0,0,0.45)';
            container.style.width = 'min(1400px, calc(100% - 24px))';
            container.style.maxHeight = '60px';
            container.style.maxWidth = 'fit-content';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.gap = '10px';
            container.style.flexWrap = 'nowrap';
            container.style.overflowX = 'auto';
            container.style.overflowY = 'hidden';
            container.style.whiteSpace = 'nowrap';
            container.style.boxSizing = 'border-box';

            // Overall progress bar pinned to the bottom of the container
            const progressBarTrack = document.createElement('div');
            progressBarTrack.style.position = 'absolute';
            progressBarTrack.style.left = '12px';
            progressBarTrack.style.right = '12px';
            progressBarTrack.style.bottom = '6px';
            progressBarTrack.style.height = '6px';
            progressBarTrack.style.background = '#2a2a2a';
            progressBarTrack.style.border = '1px solid #444';
            progressBarTrack.style.borderRadius = '999px';
            progressBarTrack.style.overflow = 'hidden';
            progressBarTrack.setAttribute('role', 'progressbar');
            progressBarTrack.setAttribute('aria-valuemin', '0');
            progressBarTrack.setAttribute('aria-valuemax', '100');

            const progressBarFill = document.createElement('div');
            progressBarFill.style.height = '100%';
            progressBarFill.style.width = '0%';
            progressBarFill.style.background = 'linear-gradient(90deg, #6dd5ed, #2193b0)';
            progressBarFill.style.transition = 'width 0.2s ease';

            progressBarTrack.appendChild(progressBarFill);
            container.appendChild(progressBarTrack);
            container.style.color = '#eee';
            container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
            container.style.lineHeight = '1.2';
            container.style.transform = 'translateX(-50%) scale(0.95)';
            container.style.transformOrigin = 'top center';

            // helper: make label+input row
            function makeInputRow(labelText, placeholderText) {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '6px';
                row.style.margin = '0 6px';
                row.style.flex = '0 0 auto';

                const label = document.createElement('label');
                label.textContent = labelText;
                label.style.fontSize = '12px';
                label.style.color = '#bbb';

                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = placeholderText;
                input.style.background = '#1e1e1e';
                input.style.border = '1px solid #555';
                input.style.color = '#eee';
                input.style.borderRadius = '6px';
                input.style.padding = '6px 8px';
                input.style.fontSize = '13px';
                input.style.cursor = 'text';
                input.style.height = '32px';

                row.appendChild(input);
                return {
                    row,
                    input
                };
            }

            // Daily timer display
            timerDisplayElement = document.createElement('div');
            timerDisplayElement.style.margin = '0 8px 0 0';
            timerDisplayElement.style.fontWeight = 'bold';
            timerDisplayElement.style.fontSize = '14px';
            timerDisplayElement.style.color = '#aed6f1';
            timerDisplayElement.style.textAlign = 'center';
            timerDisplayElement.style.flex = '0 0 auto';
            container.appendChild(timerDisplayElement);

            // Difficulty badge
            const difficultyBadgeEl = document.createElement('div');
            difficultyBadgeEl.className = `
        relative inline-flex items-center justify-center
        text-caption px-2 py-1 gap-1 rounded-full
        bg-fill-secondary text-difficulty-medium dark:text-difficulty-medium
        mx-auto my-1 lc-difficulty-badge
    `;
            difficultyBadgeEl.style.display = 'inline-flex';
            difficultyBadgeEl.style.margin = '0 8px 0 0';
            difficultyBadgeEl.style.width = 'fit-content';
            difficultyBadgeEl.style.alignItems = 'center';
            difficultyBadgeEl.style.padding = '6px 10px';
            difficultyBadgeEl.style.borderRadius = '999px';
            difficultyBadgeEl.style.fontSize = '12px';
            difficultyBadgeEl.textContent = 'Medium';
            container.appendChild(difficultyBadgeEl);

            // Solution countdown
            solutionCountdownEl = document.createElement('div');
            solutionCountdownEl.style.margin = '0 8px 0 0';
            solutionCountdownEl.style.fontSize = '13px';
            solutionCountdownEl.style.textAlign = 'center';
            solutionCountdownEl.style.color = '#ffda79';
            solutionCountdownEl.style.flex = '0 0 auto';
            container.appendChild(solutionCountdownEl);

            // Current item progress
            const individualProgressText = document.createElement('div');
            individualProgressText.style.margin = '0 8px 0 0';
            individualProgressText.style.fontSize = '13px';
            individualProgressText.style.color = '#bbb';
            individualProgressText.style.textAlign = 'center';
            individualProgressText.style.flex = '0 0 auto';
            container.appendChild(individualProgressText);

            const {
                row: timeRow,
                input: timeInput
            } = makeInputRow('Time Complexity', 'Time complexity: e.g., O(n log n)');
            const {
                row: spaceRow,
                input: spaceInput
            } = makeInputRow('Space Complexity', 'Space complexity: e.g., O(n)');
            container.appendChild(timeRow);
            container.appendChild(spaceRow);

            if (!REQUIRE_TIME_AND_SPACE_COMPLEXITY || isSystemDesignCurrent()) {
                timeRow.style.display = 'none';
                spaceRow.style.display = 'none';
            }

            // Buttons
            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.alignItems = 'center';
            buttonContainer.style.gap = '8px';
            buttonContainer.style.marginLeft = '8px';
            buttonContainer.style.flex = '0 0 auto';
            container.appendChild(buttonContainer);

            const buttonRefs = {};

            function setButtonDisabledStyles(btnEl, disabled) {
                btnEl.disabled = disabled;
                btnEl.style.opacity = disabled ? '0.5' : '1';
                btnEl.style.pointerEvents = disabled ? 'none' : 'auto';
                btnEl.style.filter = disabled ? 'grayscale(0.3)' : 'none';
            }

            function updateCompletion() {
                const progress = loadProgress();
                const allKeys = srs_items.map(it => it.key);
                const total = allKeys.length;

                // Use partial credit so the bar moves as you click Good/Easy
                const totalPoints = allKeys.reduce((acc, key) => {
                    const score = calculateCompletionScore(key);
                    return acc + Math.min(score, EASY_COMPLETION);
                }, 0);
                const maxPoints = total * EASY_COMPLETION;
                const percentOverall = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
                const clampedPercent = Math.min(Math.max(percentOverall, 0), 100);
                progressBarFill.style.width = `${clampedPercent}%`;
                progressBarTrack.title = `Overall Progress: ${totalPoints.toFixed(1)}/${maxPoints} (${clampedPercent}%)`;
                progressBarTrack.setAttribute('aria-valuenow', clampedPercent.toString());

                const currentKey = getCurrentKey();
                if (currentKey) {
                    const currentScore = calculateCompletionScore(currentKey);
                    const percentCurrent = Math.round((currentScore / 3) * 100);
                    individualProgressText.innerText = `Current Item: ${currentScore.toFixed(1)}/3 (${percentCurrent}%)`;
                    individualProgressText.style.color = currentScore >= 3 ? '#8aff8a' : '#bbb';
                }
            }

            BUTTONS.forEach(btn => {
                const b = document.createElement('button');
                b.innerText = btn;
                b.style.margin = '0';
                b.style.color = BUTTON_COLORS[btn];
                b.style.fontWeight = 'bold';
                b.style.background = 'transparent';
                b.style.border = `2px solid ${BUTTON_COLORS[btn]}`;
                b.style.borderRadius = '5px';
                b.style.padding = '6px 12px';
                b.style.height = '34px';
                b.style.lineHeight = '1.1';
                b.style.cursor = 'pointer';
                b.style.transition = 'all 0.2s ease';
                b.style.fontSize = '13px';

                b.onmouseover = () => {
                    if (b.disabled) return;
                    b.style.background = BUTTON_COLORS[btn];
                    b.style.color = 'white';
                };
                b.onmouseout = () => {
                    b.style.background = 'transparent';
                    b.style.color = BUTTON_COLORS[btn];
                };

                b.onclick = async () => {

                    await goToNextProblem(btn);
                    updateCompletion();
                    timeInput.value = '';
                    spaceInput.value = '';
                    updateButtonDisabledState();
                };

                buttonContainer.appendChild(b);
                buttonRefs[btn] = b;
            });

            document.body.appendChild(container);

            detectDifficultyAndTarget();
            if (currentKeyCached) {
                const existing = pq_load(currentKeyCached);
                if (!existing) void pq_save(currentKeyCached, perQuestionSpentSeconds, perQuestionTargetSeconds);
            }
            updatePerQuestionDisplays();
            updateCompletion();

            const gatedLabels = new Set(['Again', 'Good', 'Easy']);

            function isReady() {
                return timeInput.value.trim() && spaceInput.value.trim();
            }

            function updateButtonDisabledState() {
                let ready;
                if (!REQUIRE_TIME_AND_SPACE_COMPLEXITY || isSystemDesignCurrent()) {
                    ready = true;
                } else {
                    ready = isReady();
                }

                gatedLabels.forEach(lbl => {
                    if (buttonRefs[lbl]) setButtonDisabledStyles(buttonRefs[lbl], !ready);
                });
            }

            timeInput.addEventListener('input', updateButtonDisabledState);
            spaceInput.addEventListener('input', updateButtonDisabledState);

            updateButtonDisabledState();
        }




        /* ------------------------------------------
     "Accepted" Centering (still LC-only)
  ------------------------------------------ */
        let overlayEl = null;

        function ensureSrsStyles() {
            if (document.getElementById('lc-srs-styles')) return;
            const style = document.createElement('style');
            style.id = 'lc-srs-styles';
            style.textContent = `
      #lc-srs-container.lc-centered {
        min-width: 420px !important;
        width: auto !important;
        padding: 22px 24px 26px !important;
        border-radius: 14px !important;
        box-shadow: 0 12px 48px rgba(0,0,0,0.7) !important;
        background: rgba(30, 30, 30, 0.85) !important;
        max-height: none !important;
        white-space: normal !important;
        overflow: visible !important;
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 12px !important;
        transform: translate(-50%, -50%) scale(1.08) !important;
      }
      #lc-srs-container.lc-centered div {
        font-size: 15px !important;
      }
      #lc-srs-container.lc-centered button {
        font-size: 14px !important;
        padding: 10px 14px !important;
        border-width: 2px !important;
        border-radius: 8px !important;
        min-width: 88px !important;
        font-weight: 700 !important;
        letter-spacing: 0.3px !important;
        line-height: 1.2 !important;
        transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease !important;
      }
      #lc-srs-container.lc-centered .lc-difficulty-badge {
        margin: 0 auto !important;
      }
    `;
            document.head.appendChild(style);
        }

        function restoreContainerToCorner() {
            const el = document.getElementById('lc-srs-container');
            if (!el) return;
            el.classList.remove('lc-centered');
            if (overlayEl && overlayEl.contains(el)) {
                document.body.appendChild(el);
            }
            el.style.bottom = '';
            el.style.right = '';
            el.style.top = '10px';
            el.style.left = '50%';
            el.style.transform = 'translateX(-50%)';
            el.style.transition = 'transform 0.2s ease, top 0.2s ease, left 0.2s ease';
            el.style.position = 'fixed';
            el.style.zIndex = 9999;
            el.style.width = 'min(1400px, calc(100% - 24px))';
            el.style.maxHeight = '50px';
            if (overlayEl && overlayEl.parentNode) {
                overlayEl.parentNode.removeChild(overlayEl);
            }
            overlayEl = null;
            document.body.style.overflow = '';
        }

        function centerContainerOnSuccess() {
            ensureSrsStyles();
            const el = document.getElementById('lc-srs-container');
            if (!el) return;
            if (!overlayEl) {
                overlayEl = document.createElement('div');
                overlayEl.id = 'lc-srs-overlay';
                overlayEl.style.position = 'fixed';
                overlayEl.style.inset = '0';
                overlayEl.style.zIndex = 9998;
                overlayEl.style.background = 'rgba(0, 0, 0, 0.25)';
                overlayEl.style.backdropFilter = 'blur(8px)';
                overlayEl.style.webkitBackdropFilter = 'blur(8px)';
                overlayEl.style.transition = 'opacity 0.2s ease';
                overlayEl.style.opacity = '0';
                document.body.appendChild(overlayEl);
                requestAnimationFrame(() => {
                    overlayEl.style.opacity = '1';
                });
                document.body.style.overflow = 'hidden';
                const escHandler = (e) => {
                    if (e.key === 'Escape') {
                        restoreContainerToCorner();
                        window.removeEventListener('keydown', escHandler);
                    }
                };
                window.addEventListener('keydown', escHandler);

                overlayEl.addEventListener('click', (e) => {
                    if (e.target === overlayEl) restoreContainerToCorner();
                });
            }
            el.style.bottom = '';
            el.style.right = '';
            el.style.position = 'fixed';
            el.style.top = '50%';
            el.style.left = '50%';
            el.style.transition = 'all 0.25s ease';
            el.style.zIndex = 9999;
            el.classList.add('lc-centered');
            overlayEl.appendChild(el);
        }

        if (isLeetcode) {
            (function hookNetworkForAccepted() {
                const w = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

                const isCheckUrl = (u) => {
                    try {
                        const s = typeof u === "string" ? u : (u && u.url) || "";
                        return /\/submissions\/detail\/\d+\/check\/(?:\?.*)?$/.test(s);
                    } catch (_) {}
                    return false;
                };

                function isAccepted(data) {
                    if (!data) return false;
                    const success = (data.state === "SUCCESS" || data.finished === true);
                    const accepted = (data.status_msg === "Accepted" || data.status_code === 10);
                    const enough = (data.total_testcases >= 5 || data.total_correct >= 5 || typeof data.run_success === "boolean");
                    return success && accepted && enough;
                }

                if (w.fetch) {
                    const _fetch = w.fetch.bind(w);
                    w.fetch = async (...args) => {
                        const res = await _fetch(...args);
                        try {
                            const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
                            if (isCheckUrl(url)) {
                                res.clone().json().then((data) => {
                                    if (isAccepted(data)) centerContainerOnSuccess();
                                }).catch(() => {});
                            }
                        } catch (_) {}
                        return res;
                    };
                }

                const XHR = w.XMLHttpRequest;
                if (XHR && XHR.prototype) {
                    const _open = XHR.prototype.open;
                    const _send = XHR.prototype.send;

                    XHR.prototype.open = function(method, url, ...rest) {
                        this.__sr_url = url;
                        return _open.call(this, method, url, ...rest);
                    };

                    XHR.prototype.send = function(...args) {
                        this.addEventListener("loadend", function() {
                            try {
                                const url = this.__sr_url || "";
                                if (isCheckUrl(url) && this.responseText) {
                                    const data = JSON.parse(this.responseText);
                                    if (isAccepted(data)) centerContainerOnSuccess();
                                }
                            } catch (_) {}
                        });
                        return _send.apply(this, args);
                    };
                }
            })();
        }

        /* ------------------------------------------
     Page bootstrap
  ------------------------------------------ */
        const pathname = window.location.pathname;
        const isRootLeetcode = isLeetcode && pathname === '/';
        const isProblemPage = isLeetcode && pathname.includes('/problems/');
        const isPlaygroundLike = isSystemDesignCurrent();

        if (isRootLeetcode) {
            const current = getCurrentLink();
            const currentKey = current ? getKeyFromUrl(current) : null;
            let targetNav = (currentKey && !isCompleted(currentKey)) ? current : null;
            const nextNav = pickNextNav();

            if ((currentKey && isCompleted(currentKey)) || !targetNav) {
                targetNav = nextNav || targetNav;
            }

            if (targetNav) window.location.href = targetNav;
        } else if (isProblemPage) {
            // Save current item whenever you're on one
            await setCurrentLinkIfIncomplete(window.location.href);

            // Track key; do NOT reset per-item timer on navigation/refresh
            const key = getCurrentKey();
            if (key !== currentKeyCached) {
                currentKeyCached = key;
                const stored = pq_load(key);
                if (stored) {
                    perQuestionSpentSeconds = stored.spent || 0;
                    if (stored.target > 0) perQuestionTargetSeconds = stored.target;
                } else {
                    perQuestionSpentSeconds = 0;
                }
            }

            // Build UI
            createUI();

            // Optional helper UI, if available
            if (typeof createPythonTipsUI === 'function') {
                try {
                    createPythonTipsUI();
                } catch (_) {}
            }

            // Timer init
            await loadAndResetDailyTimer();
            updateTimerDisplay();

            // Ensure difficulty read after DOM settles
            setTimeout(() => {
                detectDifficultyAndTarget();
                // Ensure storage is seeded after final target detection
                if (currentKeyCached && !pq_load(currentKeyCached)) {
                    void pq_save(currentKeyCached, perQuestionSpentSeconds, perQuestionTargetSeconds);
                }
                updatePerQuestionDisplays();
            }, 800);

            startDailyTimer();

            // Persist both daily and per-item timers on unload
            window.addEventListener('beforeunload', () => {
                if (currentKeyCached) {
                    void pq_save(currentKeyCached, perQuestionSpentSeconds, perQuestionTargetSeconds);
                }
            });
            window.addEventListener('beforeunload', () => {
                void saveTimerProgress();
            });

            // Hook elements for Easy button visibility
            const allSummariesInDocument = document.querySelectorAll('summary');
            for (const summaryEl of allSummariesInDocument) {
                if (summaryEl.innerText.trim() === 'Common Python Methods & Templates') {
                    mainDetailsElement = summaryEl.parentElement;
                    break;
                }
            }
            easyButton = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Easy');

            if (mainDetailsElement && easyButton) {
                mainDetailsElement.addEventListener('toggle', updateEasyButtonVisibility);
            }
            updateEasyButtonVisibility();

        } else if (isPlaygroundLike) {
            // Keep the SRS UI + timers on playground too
            // Track key; do NOT reset per-item timer on navigation/refresh
            const key = getCurrentKey();
            if (key !== currentKeyCached) {
                currentKeyCached = key;
                const stored = pq_load(key);
                if (stored) {
                    perQuestionSpentSeconds = stored.spent || 0;
                    if (stored.target > 0) perQuestionTargetSeconds = stored.target;
                } else {
                    perQuestionSpentSeconds = 0;
                }
            }

            createUI();
            await loadAndResetDailyTimer();
            updateTimerDisplay();

            // After DOM settles, set SD defaults and seed storage
            setTimeout(() => {
                detectDifficultyAndTarget();
                if (currentKeyCached && !pq_load(currentKeyCached)) {
                    void pq_save(currentKeyCached, perQuestionSpentSeconds, perQuestionTargetSeconds);
                }
                updatePerQuestionDisplays();
            }, 300);

            startDailyTimer();

            // Mini toast: find matching SD item by playground ID
            const pgId = getPlaygroundId(window.location.href);
            if (pgId) {
                const item = srs_items.find(i => i.kind === 'system-design' && i.key === `sd:${pgId}`);
                if (item) {
                    // Rehydrate some fields for the toast
                    const full = system_design_items.find(sd => getPlaygroundId(sd.playground) === pgId) || {};
                    await showSystemDesignToast({
                        title: full.title || item.title,
                        topic: full.topic || '',
                        url: full.url || item.url,
                        nav: item.nav
                    });
                }
            }
        }

    } else {
        /* ----------------------------------------------
     Distraction Redirect (Facebook, YouTube, LinkedIn)
     - run only in top-level window to avoid firing inside embedded iframes
  ---------------------------------------------- */
        (async function handleDistractionRedirect() {
            if (window.top !== window.self) return;
            const distractions = ['facebook.com', 'youtube.com', 'linkedin.com'];
            const onDistractionSite = distractions.some(domain => window.location.hostname.includes(domain));
            if (onDistractionSite) {
                // Ensure the daily timer is reset when a new day starts (cross-domain)
                const today = (() => {
                    const now = new Date();
                    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                })();

                const lastDate = await GM.getValue('leetcodeTimer_lastDate', null);
                if (lastDate !== today) {
                    await GM.setValue('leetcodeTimer_lastDate', today);
                    await GM.setValue('leetcodeTimer_remainingTime', String(DAILY_TIME_LIMIT_SECONDS));
                }

                // Using GM storage so state is shared across domains
                const remainingTime = parseInt(await GM.getValue('leetcodeTimer_remainingTime', '0'), 10);
                const leetcodeDomain = 'leetcode.com';

                // If user still has LeetCode time left, redirect back
                if (remainingTime > 0 && (!window.location.hostname.includes(leetcodeDomain))) {
                    const message = document.createElement('div');
                    message.textContent = "⏰ Redirecting you to LeetCode...";
                    Object.assign(message.style, {
                        position: 'fixed',
                        top: '20px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#333',
                        color: '#fff',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        zIndex: 9999,
                        opacity: '0',
                        transition: 'opacity 0.5s ease'
                    });

                    document.body.appendChild(message);
                    requestAnimationFrame(() => {
                        message.style.opacity = '1';
                    });

                    setTimeout(() => {
                        window.location.href = 'https://leetcode.com';
                    }, 500);
                }
            }
        })();
    }
})();
