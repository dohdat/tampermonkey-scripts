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
            let btnPlay = document.getElementById("yt-audio-toggle");
            if (!btnPlay) {
                btnPlay = document.createElement("button");
                btnPlay.id = "yt-audio-toggle";
                btnPlay.textContent = "▶︎";
                btnPlay.title = "Press Space to toggle";
                Object.assign(btnPlay.style, {
                    position: "fixed",
                    bottom: "21px",
                    right: "520px",
                    zIndex: "2147483647",
                    padding: "6px 10px",
                    fontSize: "13px",
                    background: "#ff6600",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                    userSelect: "none",
                });
                document.body.appendChild(btnPlay);
            }

            let btnNext = document.getElementById("yt-audio-next");
            if (!btnNext) {
                btnNext = document.createElement("button");
                btnNext.id = "yt-audio-next";
                btnNext.textContent = "⏭";
                btnNext.title = "Next song";
                Object.assign(btnNext.style, {
                    position: "fixed",
                    bottom: "21px",
                    right: "475px",
                    zIndex: "2147483647",
                    padding: "6px 10px",
                    fontSize: "13px",
                    background: "#ff6600",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                    userSelect: "none",
                });
                document.body.appendChild(btnNext);
            }

            // hover menu for playlist choice
            let menu = document.getElementById("yt-audio-menu");
            let menuPool = null;
            let menuWhite = null;
            if (!menu) {
                menu = document.createElement("div");
                menu.id = "yt-audio-menu";
                Object.assign(menu.style, {
                    position: "fixed",
                    bottom: "50px",
                    right: "520px",
                    zIndex: "2147483647",
                    display: "none",
                    flexDirection: "column",
                    gap: "4px",
                    padding: "6px",
                    background: "#1f2933",
                    color: "white",
                    borderRadius: "6px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                    fontSize: "13px",
                    userSelect: "none",
                });

                const makeOpt = (id, label, key) => {
                    const btn = document.createElement("button");
                    btn.id = id;
                    btn.textContent = label;
                    Object.assign(btn.style, {
                        background: "#ff6600",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 8px",
                        cursor: "pointer",
                        textAlign: "left",
                    });
                    btn.onclick = () => {
                        setPlaylist(key);
                        setPlayingUI(true);
                        nextSong();
                        hideMenu();
                    };
                    return btn;
                };

                menuPool = makeOpt("yt-audio-menu-pool", "Play sofi", "pool");
                menuWhite = makeOpt("yt-audio-menu-white", "Play white noise", "whiteNoise");
                menu.appendChild(menuPool);
                menu.appendChild(menuWhite);
                document.body.appendChild(menu);
            } else {
                menuPool = document.getElementById("yt-audio-menu-pool");
                menuWhite = document.getElementById("yt-audio-menu-white");
            }

            // ---------- state ----------
            let ytPlayer = NS.player || null;
            let isPlaying = load(LS_KEYS.playing) === "1";
            let hideMenuTimer = null;

            function setPlayingUI(p) {
                isPlaying = p;
                const playingIcon = activeListKey === "whiteNoise" ? "🌫️ noise" : "🎧 Lofi";
                btnPlay.textContent = p ? playingIcon : "▶︎";
                save(LS_KEYS.playing, p ? "1" : "0");
            }

            function setPlaylistUI() {
                const label = activeListKey === "whiteNoise" ? "white noise" : "sofi";
                btnPlay.title = `Play/Pause (${label})`;
                if (menuPool && menuWhite) {
                    menuPool.style.opacity = activeListKey === "pool" ? "1" : "0.7";
                    menuWhite.style.opacity = activeListKey === "whiteNoise" ? "1" : "0.7";
                    menuPool.style.fontWeight = activeListKey === "pool" ? "700" : "400";
                    menuWhite.style.fontWeight = activeListKey === "whiteNoise" ? "700" : "400";
                }
            }

            function setPlaylist(key) {
                if (!PLAYLISTS[key]) return;
                activeListKey = key;
                save(LS_KEYS.list, key);
                setPlaylistUI();
            }

            function showMenu() {
                if (!menu) return;
                if (hideMenuTimer) clearTimeout(hideMenuTimer);
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
