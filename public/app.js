(function () {
  const SPEEDS = [0.25, 0.5, 0.75, 1];
  const SOUND_FONT = "/soundfont/sonivox.sf2";

  const els = {
    sidepane: document.getElementById("sidepane"),
    navItems: document.querySelectorAll(".nav-item"),
    tabsView: document.getElementById("tabs-view"),
    backingView: document.getElementById("backing-view"),
    playerView: document.getElementById("player-view"),
    tabList: document.getElementById("tab-list"),
    emptyState: document.getElementById("empty-state"),
    searchInput: document.getElementById("tab-search"),
    backingList: document.getElementById("backing-list"),
    backingEmptyState: document.getElementById("backing-empty-state"),
    backButton: document.getElementById("back-button"),
    songTitle: document.getElementById("song-title"),
    songArtist: document.getElementById("song-artist"),
    alphaTabContainer: document.getElementById("alphaTab-container"),
    backingPdf: document.getElementById("backing-pdf"),
    tabControls: document.getElementById("player-controls"),
    backingControls: document.getElementById("backing-controls"),
    playButton: document.getElementById("play-button"),
    stopButton: document.getElementById("stop-button"),
    backingPlayButton: document.getElementById("backing-play-button"),
    backingStopButton: document.getElementById("backing-stop-button"),
    speedDown: document.getElementById("speed-down"),
    speedUp: document.getElementById("speed-up"),
    speedValue: document.getElementById("speed-value"),
    loopButton: document.getElementById("loop-button"),
    tracksButton: document.getElementById("tracks-button"),
    tracksPanel: document.getElementById("tracks-panel"),
    closeTracks: document.getElementById("close-tracks"),
    tracksList: document.getElementById("tracks-list"),
    progressBar: document.getElementById("progress-bar"),
    currentTime: document.getElementById("current-time"),
    duration: document.getElementById("duration"),
    backingAudio: document.getElementById("backing-audio"),
    overlay: document.getElementById("overlay"),
  };

  let tabs = [];
  let backingTracks = [];
  let api = null;
  let speedIndex = 3; // default 1x
  let mutedTracks = new Set();
  let playerMode = "tab"; // "tab" | "backing"
  let backTarget = "tabs"; // where the back button goes

  // Navigation
  function setControlMode(mode) {
    playerMode = mode;
  }

  function showView(viewName) {
    els.tabsView.classList.add("hidden");
    els.backingView.classList.add("hidden");
    els.playerView.classList.add("hidden");
    els.tabControls.classList.add("hidden");
    els.backingControls.classList.add("hidden");
    els.tracksPanel.classList.add("hidden");
    els.sidepane.classList.remove("hidden");

    els.navItems.forEach((item) => item.classList.remove("active"));

    if (viewName === "tabs") {
      els.tabsView.classList.remove("hidden");
      document.querySelector('[data-view="tabs"]').classList.add("active");
    } else if (viewName === "backing") {
      els.backingView.classList.remove("hidden");
      document.querySelector('[data-view="backing"]').classList.add("active");
    } else if (viewName === "player") {
      els.playerView.classList.remove("hidden");
      els.sidepane.classList.add("hidden");
      if (playerMode === "backing") {
        els.backingControls.classList.remove("hidden");
        document.querySelector('[data-view="backing"]').classList.add("active");
      } else {
        els.tabControls.classList.remove("hidden");
        document.querySelector('[data-view="tabs"]').classList.add("active");
      }
    }
  }

  function resetAudio() {
    const audio = els.backingAudio;
    audio.pause();
    audio.currentTime = 0;
    audio.src = "";
    updateAudioProgress();
  }

  function resetPlayer() {
    if (api) {
      api.destroy();
      api = null;
    }
    resetAudio();
    els.alphaTabContainer.innerHTML = "";
    els.backingPdf.src = "";
    els.backingPdf.classList.add("hidden");
    els.alphaTabContainer.classList.remove("hidden");
    els.tracksList.innerHTML = "";
    els.loopButton.classList.remove("active");
    updatePlayButton(false);
  }

  els.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const view = item.dataset.view;
      if (view === "tabs") {
        resetPlayer();
        showView("tabs");
      } else if (view === "backing") {
        resetPlayer();
        showView("backing");
      }
      // settings is a placeholder for future functionality
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    if (els.playerView.classList.contains("hidden")) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    if (playerMode === "tab") {
      if (api) api.playPause();
    } else if (playerMode === "backing") {
      toggleAudioPlayback();
    }
  });

  // Tab list
  async function loadTabs() {
    try {
      const res = await fetch("/api/tabs");
      tabs = await res.json();
      renderTabList(tabs);
    } catch (err) {
      console.error("Failed to load tabs", err);
      els.tabList.innerHTML =
        '<div class="empty-state">Could not load tabs.</div>';
    }
  }

  function renderTabList(list) {
    els.tabList.innerHTML = "";
    if (list.length === 0) {
      els.emptyState.classList.remove("hidden");
      return;
    }
    els.emptyState.classList.add("hidden");

    list.forEach((tab) => {
      const card = document.createElement("div");
      card.className = "tab-card";
      const nameSpan = document.createElement("span");
      nameSpan.className = "tab-card-name";
      nameSpan.textContent = tab.displayName;
      card.appendChild(nameSpan);
      card.addEventListener("click", () => loadTab(tab));
      els.tabList.appendChild(card);
    });
  }

  els.searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    const filtered = tabs.filter((tab) =>
      (tab.displayName || "").toLowerCase().includes(query) ||
      (tab.artist || "").toLowerCase().includes(query) ||
      (tab.title || "").toLowerCase().includes(query)
    );
    renderTabList(filtered);
  });

  // Backing tracks
  async function loadBackingTracks() {
    try {
      const res = await fetch("/api/backing-tracks");
      backingTracks = await res.json();
      renderBackingList(backingTracks);
    } catch (err) {
      console.error("Failed to load backing tracks", err);
      els.backingList.innerHTML =
        '<div class="empty-state">Could not load backing tracks.</div>';
    }
  }

  function renderBackingList(list) {
    els.backingList.innerHTML = "";
    if (list.length === 0) {
      els.backingEmptyState.classList.remove("hidden");
      return;
    }
    els.backingEmptyState.classList.add("hidden");

    list.forEach((track) => {
      const card = document.createElement("div");
      card.className = "tab-card";
      const nameSpan = document.createElement("span");
      nameSpan.className = "tab-card-name";
      nameSpan.textContent = track.displayName;
      card.appendChild(nameSpan);
      card.addEventListener("click", () => loadBackingTrack(track));
      els.backingList.appendChild(card);
    });
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function updateAudioProgress() {
    const audio = els.backingAudio;
    const current = audio.currentTime || 0;
    const duration = audio.duration || 0;
    els.currentTime.textContent = formatTime(current);
    els.duration.textContent = formatTime(duration);
    els.progressBar.value = duration ? (current / duration) * 100 : 0;
    els.progressBar.max = 100;
  }

  function toggleAudioPlayback() {
    const audio = els.backingAudio;
    if (!audio.src) return;
    if (audio.paused) {
      audio.play().catch((err) => console.error("Audio play failed", err));
    } else {
      audio.pause();
    }
  }

  function loadBackingTrack(track) {
    resetPlayer();
    setControlMode("backing");
    backTarget = "backing";
    showView("player");

    els.songTitle.textContent = track.displayName;
    els.songArtist.textContent = "";
    els.alphaTabContainer.classList.add("hidden");
    els.backingPdf.classList.remove("hidden");
    els.backingPdf.src = `${track.pdfPath}#toolbar=0&navpanes=0`;

    els.backingAudio.src = track.mp3Path;
    els.backingAudio.load();
    updateAudioProgress();
  }

  els.backingAudio.addEventListener("timeupdate", updateAudioProgress);
  els.backingAudio.addEventListener("loadedmetadata", updateAudioProgress);
  els.backingAudio.addEventListener("ended", () => updatePlayButton(false));
  els.backingAudio.addEventListener("play", () => updatePlayButton(true));
  els.backingAudio.addEventListener("pause", () => updatePlayButton(false));

  els.progressBar.addEventListener("input", () => {
    const audio = els.backingAudio;
    if (!audio.duration || !isFinite(audio.duration)) return;
    audio.currentTime = (els.progressBar.value / 100) * audio.duration;
  });

  // Player
  function setOverlay(show) {
    if (show) els.overlay.classList.remove("hidden");
    else els.overlay.classList.add("hidden");
  }

  function loadTab(tab) {
    resetPlayer();
    setControlMode("tab");
    backTarget = "tabs";
    setOverlay(true);
    showView("player");
    mutedTracks.clear();

    els.songTitle.textContent = tab.name;
    els.songArtist.textContent = "";
    els.tracksList.innerHTML = "";

    api = new alphaTab.AlphaTabApi(els.alphaTabContainer, {
      file: tab.path,
      player: {
        enablePlayer: true,
        soundFont: SOUND_FONT,
        enableUserInteraction: true,
        scrollElement: els.alphaTabContainer.parentElement,
        scrollOffsetY: -50,
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
      },
      notation: {
        elements: {
          scoreTitle: false,
          scoreSubTitle: false,
          scoreArtist: false,
          scoreAlbum: false,
          scoreWords: false,
          scoreMusic: false,
          scoreWordsAndMusic: false,
          scoreCopyright: false,
        },
      },
    });

    api.renderStarted.on(() => {
      setOverlay(true);
      if (api && api.tracks && api.tracks.length > 0) {
        highlightTrack(api.tracks[0].index);
      }
    });
    api.renderFinished.on(() => setOverlay(false));

    api.scoreLoaded.on((score) => {
      els.songTitle.textContent = score.title || tab.name;
      els.songArtist.textContent = score.artist || "";
      renderTracksPanel(score.tracks);
      updatePlayButton(false);
    });

    api.playerStateChanged.on((e) => {
      updatePlayButton(e.state === alphaTab.synth.PlayerState.Playing);
    });

    // Reset playback speed and loop
    speedIndex = 3;
    updateSpeedDisplay();
    api.playbackSpeed = SPEEDS[speedIndex];
    api.isLooping = false;
    els.loopButton.classList.remove("active");
  }

  function updatePlayButton(isPlaying) {
    const btn = playerMode === "backing" ? els.backingPlayButton : els.playButton;
    btn.classList.toggle("playing", isPlaying);
    btn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  }

  function updateSpeedDisplay() {
    els.speedValue.textContent = SPEEDS[speedIndex] + "×";
  }

  function renderTracksPanel(tracks) {
    els.tracksList.innerHTML = "";
    tracks.forEach((track) => {
      const row = document.createElement("div");
      row.className = "track-item";
      row.dataset.trackIndex = track.index;
      row.innerHTML = `
        <span class="track-name"></span>
        <button class="track-mute">Mute</button>
      `;
      row.querySelector(".track-name").textContent =
        track.name || `Track ${track.index + 1}`;
      const muteBtn = row.querySelector(".track-mute");
      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleTrackMute(track, muteBtn);
      });
      row.addEventListener("click", () => {
        if (!api || !api.score) return;
        api.renderTracks([track]);
        highlightTrack(track.index);
      });
      els.tracksList.appendChild(row);
    });
    highlightTrack(api ? api.tracks[0].index : 0);
  }

  function highlightTrack(index) {
    els.tracksList.querySelectorAll(".track-item").forEach((row) => {
      row.classList.toggle("active", parseInt(row.dataset.trackIndex, 10) === index);
    });
  }

  function toggleTrackMute(track, button) {
    if (!api || !api.score) return;
    const muted = !mutedTracks.has(track.index);
    if (muted) {
      mutedTracks.add(track.index);
    } else {
      mutedTracks.delete(track.index);
    }
    api.changeTrackMute([track], muted);
    button.classList.toggle("muted", muted);
    button.textContent = muted ? "Muted" : "Mute";
  }

  // Controls
  els.backButton.addEventListener("click", () => {
    resetPlayer();
    showView(backTarget || "tabs");
  });

  els.playButton.addEventListener("click", () => {
    if (!api) return;
    api.playPause();
  });

  els.stopButton.addEventListener("click", () => {
    if (!api) return;
    api.stop();
  });

  els.backingPlayButton.addEventListener("click", () => {
    toggleAudioPlayback();
  });

  els.backingStopButton.addEventListener("click", () => {
    const audio = els.backingAudio;
    audio.pause();
    audio.currentTime = 0;
    updateAudioProgress();
    updatePlayButton(false);
  });

  els.speedDown.addEventListener("click", () => {
    if (!api || speedIndex <= 0) return;
    speedIndex--;
    api.playbackSpeed = SPEEDS[speedIndex];
    updateSpeedDisplay();
  });

  els.speedUp.addEventListener("click", () => {
    if (!api || speedIndex >= SPEEDS.length - 1) return;
    speedIndex++;
    api.playbackSpeed = SPEEDS[speedIndex];
    updateSpeedDisplay();
  });

  els.loopButton.addEventListener("click", () => {
    if (!api) return;
    const looping = !els.loopButton.classList.contains("active");
    els.loopButton.classList.toggle("active");
    api.isLooping = looping;
  });

  els.tracksButton.addEventListener("click", () => {
    els.tracksPanel.classList.toggle("hidden");
  });

  els.closeTracks.addEventListener("click", () => {
    els.tracksPanel.classList.add("hidden");
  });

  // Init
  loadTabs();
  loadBackingTracks();
  setControlMode("tab");
  showView("tabs");
})();
