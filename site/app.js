(function () {
    const audio = document.getElementById("audio");

    const nowTitle = document.getElementById("nowTitle");
    const currentTimeEl = document.getElementById("currentTime");
    const durationEl = document.getElementById("duration");

    const playPauseBtn = document.getElementById("playPauseBtn");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    const progress = document.getElementById("progress");
    const volume = document.getElementById("volume");
    const muteBtn = document.getElementById("muteBtn");

    const playlistEl = document.getElementById("playlist");
    const emptyHint = document.getElementById("emptyHint");

    const coverEl = document.getElementById("cover");

    let songs = [];
    let currentIndex = -1;
    let isSeeking = false;

    let pendingRestore = null;

    const PLACEHOLDER_COVER = "/max_playerok/static/cover.svg";

    const STORAGE = {
        index: "maxplayer.index",
        time: "maxplayer.time",
        volume: "maxplayer.volume",
        muted: "maxplayer.muted",
    };

    function save(k, v) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        } catch (_) {}
    }
    function load(k, d) {
        try {
            const s = localStorage.getItem(k);
            return s !== null ? JSON.parse(s) : d;
        } catch (_) {
            return d;
        }
    }

    function setCover(src) {
        coverEl.onerror = () => {
            coverEl.src = PLACEHOLDER_COVER;
        };
        coverEl.src = src || PLACEHOLDER_COVER;
    }

    function fmtTime(sec) {
        if (!isFinite(sec)) return "0:00";
        sec = Math.max(0, Math.floor(sec));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    }

    async function loadSongs() {
        try {
            const res = await fetch("/max_playerok/api/songs");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            songs = data.songs || [];
            renderPlaylist();
            if (songs.length === 0) {
                emptyHint.style.display = "";
                setCover(PLACEHOLDER_COVER);
            } else {
                emptyHint.style.display = "none";

                const savedIndex = Number(load(STORAGE.index, 0));
                const idx =
                    Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < songs.length
                        ? savedIndex
                        : 0;

                selectTrack(idx, false);

                const savedTime = Number(load(STORAGE.time, 0)) || 0;
                pendingRestore = { index: idx, time: savedTime };
            }
        } catch (e) {
            console.error("Не удалось получить список песен:", e);
            emptyHint.style.display = "";
            emptyHint.textContent = "Ошибка загрузки списка песен.";
            setCover(PLACEHOLDER_COVER);
        }
    }

    function renderPlaylist() {
        playlistEl.innerHTML = "";
        songs.forEach((song, i) => {
            const li = document.createElement("li");
            li.dataset.index = i;

            const indexEl = document.createElement("div");
            indexEl.className = "index";
            indexEl.textContent = i + 1;

            const nameEl = document.createElement("div");
            nameEl.className = "name";
            nameEl.textContent = song.title || song.path || `Трек ${i + 1}`;

            const extEl = document.createElement("div");
            extEl.className = "ext";
            extEl.textContent = song.ext ? `.${song.ext}` : "";

            li.appendChild(indexEl);
            li.appendChild(nameEl);
            li.appendChild(extEl);

            li.addEventListener("click", () => {
                selectTrack(i, true);
            });

            playlistEl.appendChild(li);
        });
        updateActive();
    }

    function updateActive() {
        [...playlistEl.children].forEach((li) => {
            const i = Number(li.dataset.index);
            li.classList.toggle("active", i === currentIndex);
        });
    }

    function selectTrack(index, autoplay) {
        if (index < 0 || index >= songs.length) return;
        currentIndex = index;
        const song = songs[currentIndex];
        audio.src = song.url;
        nowTitle.textContent = song.title || song.path || `Трек ${currentIndex + 1}`;
        const bust = (song.size || 0) + "-" + (song.mtime || 0);
        const coverUrl = song.cover ? `${song.cover}?v=${encodeURIComponent(bust)}` : PLACEHOLDER_COVER;
        setCover(coverUrl);
        updateActive();

        save(STORAGE.index, currentIndex);

        if (!autoplay) {
            if (pendingRestore && pendingRestore.index !== currentIndex) {
                pendingRestore = null;
            }
        } else {
            pendingRestore = null;
        }

        if (autoplay) {
            audio.play().catch(() => {});
        }
    }

    function playPause() {
        if (!audio.src) return;
        if (audio.paused) audio.play();
        else audio.pause();
    }

    function prev() {
        if (songs.length === 0) return;
        const nextIndex = (currentIndex - 1 + songs.length) % songs.length;
        selectTrack(nextIndex, true);
    }

    function next() {
        if (songs.length === 0) return;
        const nextIndex = (currentIndex + 1) % songs.length;
        selectTrack(nextIndex, true);
    }

    function setMuted(m) {
        audio.muted = m;
        muteBtn.textContent = m ? "🔇" : "🔈";
    }

    (function initVolume() {
        const savedVolRaw = load(STORAGE.volume, 1);
        const savedVol = Number.isFinite(Number(savedVolRaw)) ? Number(savedVolRaw) : 1;
        audio.volume = Math.min(1, Math.max(0, savedVol));
        volume.value = String(audio.volume);

        const savedMuted = !!load(STORAGE.muted, false);
        setMuted(savedMuted);
    })();

    audio.addEventListener("play", () => {
        playPauseBtn.textContent = "⏸️";
    });
    audio.addEventListener("pause", () => {
        playPauseBtn.textContent = "▶️";
    });
    audio.addEventListener("ended", () => next());

    audio.addEventListener("timeupdate", () => {
        if (isSeeking) return;
        const cur = audio.currentTime || 0;
        const dur = audio.duration || 0;
        currentTimeEl.textContent = fmtTime(cur);
        durationEl.textContent = fmtTime(dur);
        const p = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
        progress.value = String(p);

        save(STORAGE.time, Math.floor(cur));
    });

    audio.addEventListener("loadedmetadata", () => {
        durationEl.textContent = fmtTime(audio.duration || 0);

        if (pendingRestore && pendingRestore.index === currentIndex) {
            const t = Number(pendingRestore.time) || 0;
            if (t > 0 && isFinite(audio.duration)) {
                audio.currentTime = Math.min(audio.duration, t);
                currentTimeEl.textContent = fmtTime(audio.currentTime);
                const dur = audio.duration || 0;
                const p = dur > 0 ? Math.min(100, Math.max(0, (audio.currentTime / dur) * 100)) : 0;
                progress.value = String(p);
            }
            pendingRestore = null;
        }
    });

    audio.addEventListener("volumechange", () => {
        save(STORAGE.volume, audio.volume);
        save(STORAGE.muted, audio.muted);
        muteBtn.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔈";
        volume.value = String(audio.volume);
    });

    playPauseBtn.addEventListener("click", playPause);
    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);

    progress.addEventListener("input", () => {
        isSeeking = true;
    });
    progress.addEventListener("change", () => {
        const dur = audio.duration || 0;
        const p = Number(progress.value) / 100;
        audio.currentTime = dur * p;
        isSeeking = false;
    });

    volume.addEventListener("input", () => {
        audio.volume = Number(volume.value);
    });

    muteBtn.addEventListener("click", () => {
        setMuted(!audio.muted);
    });

    document.addEventListener("keydown", (e) => {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (["input", "textarea"].includes(tag)) return;

        if (e.code === "Space") {
            e.preventDefault();
            playPause();
        } else if (e.key.toLowerCase() === "m") {
            setMuted(!audio.muted);
        } else if (e.key.toLowerCase() === "j") {
            prev();
        } else if (e.key.toLowerCase() === "l") {
            next();
        } else if (e.key === "ArrowLeft") {
            audio.currentTime = Math.max(0, audio.currentTime - 5);
        } else if (e.key === "ArrowRight") {
            if (isFinite(audio.duration)) {
                audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            audio.volume = Math.min(1, audio.volume + 0.05);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            audio.volume = Math.max(0, audio.volume - 0.05);
        }
    });

    window.addEventListener("beforeunload", () => {
        save(STORAGE.time, Math.floor(audio.currentTime || 0));
        save(STORAGE.index, currentIndex);
        save(STORAGE.volume, audio.volume);
        save(STORAGE.muted, audio.muted);
    });

    loadSongs();
})();