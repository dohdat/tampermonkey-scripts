// ==UserScript==
// @name         YT audio on Leetcode
// @namespace    http://tampermonkey.net/
// @version      1.8.1
// @description  Add spaced-repetition buttons, redirect to current problem, and track daily time spent (countdown)
// @author       You
// @match        https://leetcode.com/*
// @match        https://*.leetcode.com/*
// @match        https://facebook.com/*
// @match        https://www.facebook.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://youtu.be/*
// @match        https://linkedin.com/*
// @match        https://www.linkedin.com/*
// @match        https://codesandbox.io/p/sandbox/*
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
   YouTube Audio (SPA-safe resume + single API load)
   Singleton: always exactly one player instance
   ---------------------------------------------- */
    (function () {
        const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

        // ---------- singleton namespace ----------
        const NS = (W.__YTAUDIO__ = W.__YTAUDIO__ || {
            player: null,
            saveTimer: null,
            listenersHooked: false,
            apiHooked: false,
            firstClickAutoplayDone: false,
        });

        // ---------- tiny utils ----------
        const LS_KEYS = {
            playing: "ytAudioIsPlaying",
            time: "ytAudioTime",
            vid: "ytAudioVideoId",
            list: "ytAudioList",
        };

        const save = (k, v) => {
            try {
                localStorage.setItem(k, String(v));
            } catch {}
        };

        const load = (k, dflt = null) => {
            try {
                const v = localStorage.getItem(k);
                return v == null ? dflt : v;
            } catch {
                return dflt;
            }
        };

        function onReady(fn) {
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", fn, { once: true });
            } else if (!document.body) {
                const t = setInterval(() => {
                    if (document.body) {
                        clearInterval(t);
                        fn();
                    }
                }, 25);
                setTimeout(() => clearInterval(t), 5000);
            } else {
                fn();
            }
        }

        onReady(() => {
            function injectStyles() {
                if (document.getElementById("yt-audio-styles")) return;
                const isDark =
                    document.documentElement.dataset.theme === "dark" ||
                    document.body.dataset.theme === "dark";
                const palette = {
                    primary: "#ffa116",
                    primaryLow: "#e68900",
                    primaryHover: "#ffb23d",
                    text: isDark ? "#f5f6f7" : "#111318",
                    textMuted: isDark ? "#9ea3aa" : "#4d5561",
                    surface: isDark ? "#1d1f23" : "#ffffff",
                    hoverSurface: isDark ? "#272a31" : "#f5f7fa",
                    border: isDark ? "#2e3138" : "#e5e7eb",
                    shadow: isDark
                        ? "0 12px 32px rgba(0,0,0,0.55)"
                        : "0 12px 32px rgba(16,24,40,0.18)",
                };
                const style = document.createElement("style");
                style.id = "yt-audio-styles";
                style.textContent = `
                #yt-audio-wrapper {
                    position: fixed;
                    bottom: 21px;
                    right: 520px;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    z-index: 2147483647;
                    font-family: "Helvetica Neue", Arial, sans-serif;
                }
                #yt-audio-wrapper.yt-audio-wrapper--docked {
                    position: relative;
                    bottom: auto;
                    right: auto;
                    display: inline-flex;
                    gap: 8px;
                    box-shadow: none;
                }
                .yt-audio-btn {
                    border-radius: 8px;
                    padding: 8px 12px;
                    font-size: 13px;
                    font-weight: 600;
                    border: 1px solid ${palette.border};
                    background: ${palette.surface};
                    color: ${palette.text};
                    box-shadow: ${palette.shadow};
                    cursor: pointer;
                    transition: all 0.16s ease;
                    min-width: 96px;
                    line-height: 1.1;
                }
                .yt-audio-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 16px 36px rgba(0,0,0,0.16);
                }
                .yt-audio-btn:active {
                    transform: translateY(0);
                }
                .yt-audio-btn:focus-visible {
                    outline: 2px solid ${palette.primaryHover};
                    outline-offset: 2px;
                }
                .yt-audio-btn--primary {
                    background: linear-gradient(180deg, ${palette.primary} 0%, ${palette.primaryLow} 100%);
                    border-color: #d07a00;
                    color: #111318;
                }
                .yt-audio-btn--primary:hover {
                    background: linear-gradient(180deg, ${palette.primaryHover} 0%, ${palette.primary} 100%);
                }
                .yt-audio-btn--secondary {
                    background: ${palette.surface};
                    color: ${palette.textMuted};
                }
                .yt-audio-btn--secondary:hover {
                    color: ${palette.text};
                    background: ${palette.hoverSurface};
                }
                #yt-audio-menu {
                    position: absolute;
                    bottom: 46px;
                    right: 0;
                    display: none;
                    flex-direction: column;
                    gap: 6px;
                    padding: 8px;
                    background: ${palette.surface};
                    color: ${palette.text};
                    border-radius: 10px;
                    box-shadow: ${palette.shadow};
                    border: 1px solid ${palette.border};
                    min-width: 180px;
                }
                #yt-audio-wrapper.yt-audio-wrapper--docked #yt-audio-menu {
                    bottom: auto;
                    top: calc(100% + 6px);
                    right: 0;
                }
                .yt-audio-menu__item {
                    background: transparent;
                    color: ${palette.text};
                    border: 1px solid transparent;
                    border-radius: 8px;
                    padding: 8px 10px;
                    text-align: left;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    transition: background 0.15s ease, border-color 0.15s ease;
                }
                .yt-audio-menu__item:hover {
                    background: ${palette.hoverSurface};
                }
                .yt-audio-menu__item.active {
                    border-color: ${palette.primary};
                    background: ${palette.hoverSurface};
                }
                `;
                document.head.appendChild(style);
            }
            injectStyles();

            // ---------- choose (and persist) the video once ----------
            const pool = ["28KRPhVzCus", "Na0w3Mz46GA", "Z_8f5IWuTFg", "XSXEaikz0Bc", "9kzE8isXlQY"];
            const whiteNoise = ["iDdVKuL6SBQ", "iYDMTcqis7Q", "-FKQcej1aeQ", "c2sh1bQOeQo", "JDST0qFChPw"];
            const PLAYLISTS = { pool, whiteNoise };
            const DEFAULT_LIST_KEY = "pool";
            let activeListKey = load(LS_KEYS.list, DEFAULT_LIST_KEY);
            if (!PLAYLISTS[activeListKey]) activeListKey = DEFAULT_LIST_KEY;
            save(LS_KEYS.list, activeListKey);
            let videoId = load(LS_KEYS.vid, null);

            const currentList = () => PLAYLISTS[activeListKey] || pool;
            const pickRandom = (list, avoidId = null) => {
                if (!list?.length) return avoidId;
                if (list.length === 1) return list[0];
                let choice;
                do {
                    choice = list[Math.floor(Math.random() * list.length)];
                } while (choice === avoidId);
                return choice;
            };

            if (!videoId || !currentList().includes(videoId)) {
                videoId = pickRandom(currentList());
                save(LS_KEYS.vid, videoId);
            }

            // ---------- hidden container (single) ----------
            let host = document.getElementById("yt-audio");
            if (!host) {
                host = document.createElement("div");
                host.id = "yt-audio";
                host.style.cssText =
                    "position:fixed;width:0;height:0;overflow:hidden;opacity:0;";
                document.body.appendChild(host);
            } else {
                // ensure it’s empty (prevents stray iframes if something went wrong earlier)
                host.textContent = "";
            }

            // ---------- load the YouTube IFrame API once ----------
            if (!document.getElementById("tm-yt-api")) {
                const s = document.createElement("script");
                s.id = "tm-yt-api";
                s.src = "https://www.youtube.com/iframe_api";
                document.head.appendChild(s);
            }

            // ---------- UI (single) ----------
            let wrapper = document.getElementById("yt-audio-wrapper");
            if (!wrapper) {
                wrapper = document.createElement("div");
                wrapper.id = "yt-audio-wrapper";
                document.body.appendChild(wrapper);
            }

            let btnPlay = document.getElementById("yt-audio-toggle");
            if (!btnPlay) {
                btnPlay = document.createElement("button");
                btnPlay.id = "yt-audio-toggle";
                btnPlay.textContent = "Play audio";
                btnPlay.title = "Press Space to toggle";
                btnPlay.className = "yt-audio-btn yt-audio-btn--primary";
                wrapper.appendChild(btnPlay);
            } else {
                btnPlay.removeAttribute("style");
                btnPlay.classList.add("yt-audio-btn", "yt-audio-btn--primary");
                if (btnPlay.parentNode !== wrapper) wrapper.appendChild(btnPlay);
            }

            let btnNext = document.getElementById("yt-audio-next");
            if (!btnNext) {
                btnNext = document.createElement("button");
                btnNext.id = "yt-audio-next";
                btnNext.textContent = "Next track";
                btnNext.title = "Next song";
                btnNext.className = "yt-audio-btn yt-audio-btn--secondary";
                wrapper.appendChild(btnNext);
            } else {
                btnNext.removeAttribute("style");
                btnNext.classList.add("yt-audio-btn", "yt-audio-btn--secondary");
                if (btnNext.parentNode !== wrapper) wrapper.appendChild(btnNext);
            }

            // hover menu for playlist choice
            let menu = document.getElementById("yt-audio-menu");
            let menuPool = null;
            let menuWhite = null;
            if (!menu) {
                menu = document.createElement("div");
                menu.id = "yt-audio-menu";
                menu.setAttribute("role", "menu");

                const makeOpt = (id, label, key) => {
                    const btn = document.createElement("button");
                    btn.id = id;
                    btn.textContent = label;
                    btn.className = "yt-audio-menu__item";
                    btn.onclick = () => {
                        setPlaylist(key);
                        setPlayingUI(true);
                        nextSong();
                        hideMenu();
                    };
                    return btn;
                };

                menuPool = makeOpt("yt-audio-menu-pool", "Play Lofi", "pool");
                menuWhite = makeOpt("yt-audio-menu-white", "Play white noise", "whiteNoise");
                menu.appendChild(menuPool);
                menu.appendChild(menuWhite);
                wrapper.appendChild(menu);
            } else {
                menuPool = document.getElementById("yt-audio-menu-pool");
                menuWhite = document.getElementById("yt-audio-menu-white");
                menu.removeAttribute("style");
                if (menu.parentNode !== wrapper) wrapper.appendChild(menu);
            }

            // ---------- state ----------
            let ytPlayer = NS.player || null;
            let isPlaying = load(LS_KEYS.playing) === "1";
            let hideMenuTimer = null;
            const DOCK_ARIA = "Upgrade to premium to use debugger";
            const isMenuDetached = () => menu && menu.parentElement === document.body;

            function setPlayingUI(p) {
                isPlaying = p;
                const label = activeListKey === "whiteNoise" ? "White noise" : "Lofi";
                btnPlay.textContent = p ? `${label} playing` : `Play ${label}`;
                save(LS_KEYS.playing, p ? "1" : "0");
            }

            function setPlaylistUI() {
                const label = activeListKey === "whiteNoise" ? "White noise" : "Lofi";
                btnPlay.title = `Play/Pause (${label})`;
                if (menuPool && menuWhite) {
                    menuPool.classList.toggle("active", activeListKey === "pool");
                    menuWhite.classList.toggle("active", activeListKey === "whiteNoise");
                }
            }

            function setPlaylist(key) {
                if (!PLAYLISTS[key]) return;
                activeListKey = key;
                save(LS_KEYS.list, key);
                setPlaylistUI();
            }

            function tryDockToDebugger() {
                const target = document.querySelector(`button[aria-label*="${DOCK_ARIA}"]`);
                if (!target || !target.parentElement) {
                    if (wrapper.classList.contains("yt-audio-wrapper--docked")) {
                        wrapper.classList.remove("yt-audio-wrapper--docked");
                        if (document.body && wrapper.parentNode !== document.body) {
                            document.body.appendChild(wrapper);
                        }
                        if (menu && menu.parentNode !== wrapper) {
                            wrapper.appendChild(menu);
                        }
                    }
                    return false;
                }
                const parent = target.parentElement;
                if (wrapper.parentNode !== parent) {
                    parent.insertBefore(wrapper, target);
                }
                wrapper.classList.add("yt-audio-wrapper--docked");
                if (menu && menu.parentNode !== document.body) {
                    document.body.appendChild(menu);
                }
                return true;
            }

            function showMenu() {
                if (!menu) return;
                if (hideMenuTimer) clearTimeout(hideMenuTimer);
                if (isMenuDetached()) {
                    const rect = btnPlay.getBoundingClientRect();
                    menu.style.position = "fixed";
                    menu.style.left = `${rect.left}px`;
                    menu.style.top = `${rect.bottom + 6}px`;
                    menu.style.right = "auto";
                    menu.style.bottom = "auto";
                } else {
                    menu.style.position = "";
                    menu.style.left = "";
                    menu.style.top = "";
                    menu.style.right = "";
                    menu.style.bottom = "";
                }
                menu.style.display = "flex";
            }

            function hideMenu() {
                if (!menu) return;
                menu.style.display = "none";
                hideMenuTimer = null;
            }

            function scheduleHideMenu() {
                if (hideMenuTimer) clearTimeout(hideMenuTimer);
                hideMenuTimer = setTimeout(hideMenu, 180);
            }

            function startSavingTime() {
                stopSavingTime();
                NS.saveTimer = setInterval(() => {
                    if (ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
                        const t = ytPlayer.getCurrentTime();
                        if (!isNaN(t)) save(LS_KEYS.time, Math.floor(t));
                    }
                }, 1000);
            }

            function stopSavingTime() {
                if (NS.saveTimer) {
                    clearInterval(NS.saveTimer);
                    NS.saveTimer = null;
                }
            }

            function persistNow() {
                if (ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
                    const t = ytPlayer.getCurrentTime();
                    if (!isNaN(t)) save(LS_KEYS.time, Math.floor(t));
                }
                save(LS_KEYS.playing, isPlaying ? "1" : "0");
            }

            function toggleAudio() {
                if (!ytPlayer || typeof ytPlayer.getPlayerState !== "function") return;
                const state = ytPlayer.getPlayerState();
                if (state === 1) {
                    ytPlayer.pauseVideo();
                    setPlayingUI(false);
                } else {
                    ytPlayer.playVideo();
                    setPlayingUI(true);
                }
            }

            function nextSong() {
                const list = currentList();
                if (!list?.length) return;
                // Pick a new random video (not the same)
                const newVid = pickRandom(list, videoId);

                videoId = newVid;
                save(LS_KEYS.vid, videoId);
                save(LS_KEYS.list, activeListKey);
                save(LS_KEYS.time, 0);

                if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
                    ytPlayer.loadVideoById(videoId);
                } else {
                    initPlayer(); // will assign NS.player and local ytPlayer
                }

                if (isPlaying && ytPlayer && ytPlayer.playVideo) {
                    ytPlayer.playVideo();
                }
            }

            // bind (or rebind) button handlers (no duplicate listeners)
            btnPlay.onclick = toggleAudio;
            btnNext.onclick = nextSong;
            btnPlay.addEventListener("mouseenter", showMenu);
            btnPlay.addEventListener("mouseleave", scheduleHideMenu);
            if (menu) {
                menu.addEventListener("mouseenter", showMenu);
                menu.addEventListener("mouseleave", scheduleHideMenu);
            }
            setPlaylistUI();
            setPlayingUI(isPlaying);
            tryDockToDebugger();

            // ---------- global listeners (hook once) ----------
            if (!NS.listenersHooked) {
                NS.listenersHooked = true;

                document.addEventListener("keydown", (e) => {
                    const tag = e.target.tagName?.toLowerCase();
                    if (
                        tag === "input" ||
                        tag === "textarea" ||
                        e.target.isContentEditable
                    )
                        return;

                    // Uncomment if you want space to toggle
                    // if (e.code === 'Space') {
                    //   e.preventDefault();
                    //   toggleAudio();
                    // }
                });

                document.addEventListener("visibilitychange", persistNow);
                window.addEventListener("pagehide", persistNow);
                window.addEventListener("beforeunload", persistNow);
                const observer = new MutationObserver(() => {
                    tryDockToDebugger();
                });
                observer.observe(document.body, { childList: true, subtree: true });

                document.addEventListener(
                    "click",
                    () => {
                        if (NS.firstClickAutoplayDone || !NS.player) return;
                        NS.firstClickAutoplayDone = true;
                        if (load(LS_KEYS.playing) === "1") NS.player.playVideo();
                    },
                    { once: true },
                );
            }

            // ---------- YT API / Player (single instance) ----------
            function initPlayer() {
                // Reuse existing player if present
                if (NS.player && typeof NS.player.getPlayerState === "function") {
                    ytPlayer = NS.player;
                    setPlayingUI(isPlaying);

                    // seek to saved time on reuse
                    const resumeAt = parseInt(load(LS_KEYS.time, "0"), 10) || 0;
                    if (resumeAt > 0) ytPlayer.seekTo(resumeAt, true);
                    if (isPlaying) ytPlayer.playVideo();
                    return;
                }

                // Ensure host is empty before creating a fresh player
                host.textContent = "";

                ytPlayer = new W.YT.Player("yt-audio", {
                    height: "0",
                    width: "0",
                    videoId,
                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                        loop: 1,
                        playlist: videoId,
                        playsinline: 1,
                        iv_load_policy: 3,
                        modestbranding: 1,
                    },
                    events: {
                        onReady: () => {
                            const resumeAt = parseInt(load(LS_KEYS.time, '0'), 10) || 0;
                            if (resumeAt > 0) ytPlayer.seekTo(resumeAt, true);
                            if (isPlaying) ytPlayer.playVideo();
                            setPlayingUI(isPlaying);
                        },
                        onStateChange: (e) => {
                            if (!W.YT || !W.YT.PlayerState) return;
                            const PS = W.YT.PlayerState;

                            switch (e.data) {
                                case PS.PLAYING:
                                    setPlayingUI(true);     // ← keep the button in sync when autoplay/loop starts
                                    startSavingTime();
                                    break;

                                case PS.PAUSED:
                                case PS.ENDED:
                                    setPlayingUI(false);    // ← reflect pauses/ends that weren’t triggered by your button
                                    stopSavingTime();
                                    persistNow();
                                    break;
                                default:
                                    break;
                            }
                        }
                    },
                });
                // Save singleton
                NS.player = ytPlayer;
            }

            // Hook API ready exactly once
            if (!NS.apiHooked) {
                NS.apiHooked = true;
                const prev = W.onYouTubeIframeAPIReady;
                W.onYouTubeIframeAPIReady = function () {
                    if (typeof prev === "function") {
                        try {
                            prev();
                        } catch {}
                    }
                    initPlayer();
                };
            }

            // If API already available, init now
            if (W.YT && W.YT.Player) {
                initPlayer();
            }
        });
    })();
