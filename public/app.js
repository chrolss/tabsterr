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
    backButton: document.getElementById("back-button"),
    songTitle: document.getElementById("song-title"),
    songArtist: document.getElementById("song-artist"),
    alphaTabContainer: document.getElementById("alphaTab-container"),
    playerControls: document.getElementById("player-controls"),
    playButton: document.getElementById("play-button"),
    stopButton: document.getElementById("stop-button"),
    speedDown: document.getElementById("speed-down"),
    speedUp: document.getElementById("speed-up"),
    speedValue: document.getElementById("speed-value"),
    loopButton: document.getElementById("loop-button"),
    tracksButton: document.getElementById("tracks-button"),
    tracksPanel: document.getElementById("tracks-panel"),
    closeTracks: document.getElementById("close-tracks"),
    tracksList: document.getElementById("tracks-list"),
    overlay: document.getElementById("overlay"),
  };

  let tabs = [];
  let api = null;
  let speedIndex = 3; // default 1x
  let mutedTracks = new Set();

  // Navigation
  function showView(viewName) {
    els.tabsView.classList.add("hidden");
    els.backingView.classList.add("hidden");
    els.playerView.classList.add("hidden");
    els.playerControls.classList.add("hidden");
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
      els.playerControls.classList.remove("hidden");
      els.sidepane.classList.add("hidden");
      document.querySelector('[data-view="tabs"]').classList.add("active");
    }
  }

  els.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const view = item.dataset.view;
      if (view === "tabs") {
        showView("tabs");
        if (api) api.pause();
      } else if (view === "backing") {
        showView("backing");
      }
      // settings is a placeholder for future functionality
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    if (els.playerView.classList.contains("hidden") || !api) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    if (!e.repeat) api.playPause();
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
      card.innerHTML = `
        <span class="tab-card-icon">🎼</span>
        <span class="tab-card-name"></span>
      `;
      card.querySelector(".tab-card-name").textContent = tab.name;
      card.addEventListener("click", () => loadTab(tab));
      els.tabList.appendChild(card);
    });
  }

  els.searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    const filtered = tabs.filter((tab) =>
      tab.name.toLowerCase().includes(query)
    );
    renderTabList(filtered);
  });

  // Player
  function setOverlay(show) {
    if (show) els.overlay.classList.remove("hidden");
    else els.overlay.classList.add("hidden");
  }

  function loadTab(tab) {
    setOverlay(true);
    showView("player");
    mutedTracks.clear();

    if (api) {
      api.destroy();
      api = null;
    }

    els.alphaTabContainer.innerHTML = "";
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
    els.playButton.classList.toggle("playing", isPlaying);
    els.playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
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
    showView("tabs");
    if (api) api.pause();
  });

  els.playButton.addEventListener("click", () => {
    if (!api) return;
    api.playPause();
  });

  els.stopButton.addEventListener("click", () => {
    if (!api) return;
    api.stop();
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
  showView("tabs");
})();
