(() => {
  'use strict';

  const cfg = window.PLAYER_CONFIG || {};
  const songs = Array.isArray(cfg.songs) ? cfg.songs : [];
  const T = Object.assign({
    songList: 'Song List',
    back: 'Back',
    noLyrics: 'No lyrics for this song yet.',
    loadError: "Couldn't load this song. Check the file path in songs.js.",
    empty: 'No songs yet. Add some in songs.js.',
    findLyrics: 'Find lyrics online',
    searching: 'Looking for lyrics…',
    found: 'Lyrics found.',
    foundOff: 'Lyrics found for a slightly different version, so the timing may be off. Edit lyrics has Earlier / Later buttons.',
    lyricsOffline: "Couldn't reach the lyrics database."
  }, cfg.strings || {});
  const DEFAULT_ACCENT = cfg.accent || '#ff2d55';
  const DEFAULT_ACCENT2 = cfg.accent2 || '#8b5cf6';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);
  const audio = $('audio');
  const el = {
    root: document.documentElement,
    bg: $('bg'), bgA: $('bgA'), bgB: $('bgB'),
    listPage: $('listPage'), playerPage: $('playerPage'), list: $('songList'), listEmpty: $('listEmpty'),
    card: $('card'), cover: $('cover'), title: $('title'), artist: $('artist'), lyrics: $('lyrics'),
    seek: $('seek'), tCur: $('tCur'), tDur: $('tDur'),
    play: $('play'), iPlay: $('iPlay'), iPause: $('iPause'), prev: $('prev'), next: $('next'),
    repeat: $('repeat'), repeatOne: $('repeatOne'), shuffle: $('shuffle'),
    vol: $('vol'), dim: $('dim'), toast: $('toast')
  };

  /* ---------- Small helpers ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mp:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mp:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  const fillRange = (r) => r.style.setProperty('--pct', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3600);
  }

  /* ---------- State ---------- */
  let view = 'list';
  let loadedIndex = -1;
  let shuffle = false;
  let repeat = 0; // 0 off, 1 all, 2 one
  const played = [];
  let loadToken = 0;
  let dragging = false;

  /* ---------- Static text ---------- */
  $('listTitle').textContent = T.songList;
  $('backLabel').textContent = T.back;
  $('footer').textContent = cfg.footer || '';
  el.listEmpty.textContent = T.empty;
  el.root.style.setProperty('--accent', DEFAULT_ACCENT);
  el.root.style.setProperty('--accent-2', DEFAULT_ACCENT2);

  /* ---------- Background (crossfading layers, video / image / gradient) ---------- */
  let bgActive = 'A';
  let bgKey = null;
  let hoverIdx = -1;      // song row under the pointer (or focused) in the list
  let holdUntil = 0;      // short grace period right after opening a song
  const isVideo = (s) => /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(s);

  // The background video keeps running while a song plays, while the pointer is on a song
  // in the list, and while the list is open. It only pauses when none of those is true.
  const wantVideo = () => (!audio.paused && !audio.ended) || hoverIdx >= 0 || view === 'list' || performance.now() < holdUntil;
  const activeVideo = () => (bgActive === 'A' ? el.bgA : el.bgB).querySelector('video');
  const playVideo = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  function syncVideo() {
    const v = activeVideo();
    if (!v) return;
    if (wantVideo()) {
      if (v.paused || v.ended) { playVideo(v); v._lt = v.currentTime; v._ls = performance.now(); v._fix = 0; return; }
      // Watchdog: if the picture has not moved for a while, nudge it, then reload it.
      const now = performance.now();
      if (v.currentTime !== v._lt) { v._lt = v.currentTime; v._ls = now; v._fix = 0; }
      else if (now - (v._ls || now) > 2500) {
        v._ls = now; v._fix = (v._fix || 0) + 1;
        if (v._fix === 1) { try { v.currentTime = 0; } catch (e) { /* ignore */ } } else { v.load(); }
        playVideo(v);
      }
    } else if (v.readyState >= 2 && !v.paused) {
      v.pause();
    }
  }
  setInterval(syncVideo, 1000);
  document.addEventListener('visibilitychange', syncVideo);
  audio.addEventListener('play', syncVideo);
  audio.addEventListener('pause', syncVideo);

  function setBackground(src, accent, accent2 = DEFAULT_ACCENT2) {
    const key = (src || '') + '|' + accent + '|' + accent2;
    if (key === bgKey) return;   // same background: keep it running, no restart
    bgKey = key;
    const next = bgActive === 'A' ? el.bgB : el.bgA;
    const prev = bgActive === 'A' ? el.bgA : el.bgB;
    bgActive = bgActive === 'A' ? 'B' : 'A';

    next.textContent = '';
    next.style.backgroundImage = '';
    next.style.setProperty('--accent', accent);
    next.style.setProperty('--accent-2', accent2);
    next.className = 'bg-layer';

    const gradient = () => { next.textContent = ''; next.style.backgroundImage = ''; next.classList.add('gradient'); };
    if (!src) {
      gradient();
    } else if (isVideo(src)) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
      v.disablePictureInPicture = true;
      v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.addEventListener('error', gradient);
      v.addEventListener('loadeddata', syncVideo);
      v.addEventListener('ended', () => { v.currentTime = 0; playVideo(v); });
      v.addEventListener('pause', () => {
        setTimeout(() => { if (v.isConnected && v.paused && wantVideo() && !document.hidden) playVideo(v); }, 60);
      });
      v.src = src;
      next.appendChild(v);
      playVideo(v);
    } else {
      next.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      next.classList.add('show');
      prev.classList.remove('show');
    }));
    setTimeout(() => { if (!prev.classList.contains('show')) { prev.textContent = ''; } }, 1100);
  }

  if (!reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      el.bg.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3));
      el.bg.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3));
    }, { passive: true });
  }

  /* ---------- Audio graph (for the beat-reactive glow; needs http/https) ---------- */
  let ctx = null, analyser = null, freq = null;
  function ensureGraph() {
    if (ctx || !/^https?:$/.test(location.protocol)) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) { ctx = null; analyser = null; }
  }

  /* ---------- Song list ---------- */
  const rows = [];
  const MQ_GAP = 36;

  // A one-line text box. If the text is too long it scrolls right to left while the row is hovered.
  function marquee(text, cls) {
    const box = document.createElement('div'); box.className = 'mq ' + cls;
    const track = document.createElement('span'); track.className = 'mq-track';
    const t = document.createElement('span'); t.textContent = text;
    track.appendChild(t); box.appendChild(track);
    return box;
  }
  const mqWidth = (box) => box.firstChild.firstChild.offsetWidth;
  const mqClip = (box) => box.classList.toggle('clip', mqWidth(box) > box.clientWidth + 1);
  function mqStart(box) {
    const w = mqWidth(box);
    if (w <= box.clientWidth + 1) return;
    const track = box.firstChild;
    if (track.children.length < 2) {
      const copy = track.firstChild.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.appendChild(copy);
    }
    const dist = w + MQ_GAP;
    box.style.setProperty('--mq-dist', dist + 'px');
    box.style.setProperty('--mq-dur', (dist / 45).toFixed(2) + 's');
    box.classList.add('run');
  }
  function mqStop(box) {
    box.classList.remove('run');
    const track = box.firstChild;
    while (track.children.length > 1) track.lastChild.remove();
  }
  function refreshClips() { rows.forEach((b) => b.querySelectorAll('.mq').forEach(mqClip)); }

  function setTheme(a, a2) {
    el.root.style.setProperty('--accent', a);
    el.root.style.setProperty('--accent-2', a2);
  }
  function applyListTheme() {
    setTheme(DEFAULT_ACCENT, DEFAULT_ACCENT2);
    setBackground(cfg.listBackground || null, DEFAULT_ACCENT, DEFAULT_ACCENT2);
  }

  // Pointing at a song in the list previews that song's background.
  let hoverTimer = 0;
  function hoverSong(i) {
    clearTimeout(hoverTimer);
    if (view !== 'list') return;
    hoverIdx = i;
    const s = songs[i];
    const a = s.accent || DEFAULT_ACCENT, a2 = s.accent2 || DEFAULT_ACCENT2;
    setTheme(a, a2);
    setBackground(s.background || null, a, a2);
    syncVideo();
  }
  function unhoverSong() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (view !== 'list') return;
      hoverIdx = -1;
      applyListTheme();
      syncVideo();
    }, 160);
  }

  function renderList() {
    el.list.textContent = '';
    rows.length = 0;
    el.listEmpty.hidden = songs.length > 0;
    songs.forEach((s, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--i', i);
      li.style.setProperty('--c', s.accent || DEFAULT_ACCENT);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'song';

      const c = document.createElement('div'); c.className = 's-cover';
      if (s.cover) {
        const img = document.createElement('img');
        img.src = s.cover; img.alt = ''; img.loading = 'lazy';
        img.addEventListener('error', () => img.remove());
        c.appendChild(img);
      }
      const m = document.createElement('div'); m.className = 's-meta';
      m.append(marquee(s.title || 'Untitled', 's-title'), marquee(s.artist || '', 's-artist'));
      const eq = document.createElement('div'); eq.className = 'eq';
      eq.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));

      b.append(c, m, eq);
      const on = () => { b.querySelectorAll('.mq').forEach(mqStart); hoverSong(i); };
      const off = () => { b.querySelectorAll('.mq').forEach(mqStop); unhoverSong(); };
      b.addEventListener('pointerenter', on);
      b.addEventListener('pointerleave', off);
      b.addEventListener('focus', on);
      b.addEventListener('blur', off);
      b.addEventListener('click', () => openSong(i));
      li.appendChild(b);
      el.list.appendChild(li);
      rows.push(b);
    });
    markRows();
  }
  function markRows() {
    const playing = !audio.paused && !audio.ended;
    rows.forEach((b, i) => {
      b.classList.toggle('current', i === loadedIndex);
      b.classList.toggle('playing', i === loadedIndex && playing);
    });
  }

  /* ---------- Lyrics ---------- */
  let lines = [];      // [{t, text}]
  let lineEls = [];
  let activeLine = -1;
  let timed = false;
  let userScrollUntil = 0;

  function parseLRC(text) {
    const out = [];
    let offset = 0;
    let anyTag = false;
    text.split(/\r?\n/).forEach((raw) => {
      const off = raw.match(/^\s*\[offset:\s*(-?\d+)\s*\]/i);
      if (off) { offset = parseInt(off[1], 10) / 1000; return; }
      const tags = Array.from(raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g));
      if (!tags.length) return;
      anyTag = true;
      const txt = raw.replace(/\[[^\]]*\]/g, '').trim();
      tags.forEach((m) => out.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.')) + offset, text: txt }));
    });
    if (anyTag) return { timed: true, lines: out.sort((a, b) => a.t - b.t) };
    const plain = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => ({ t: null, text: l }));
    return { timed: false, lines: plain };
  }

  function showLyricsNote(msg, withFind) {
    el.lyrics.textContent = '';
    const p = document.createElement('p');
    p.className = 'lyrics-note';
    p.textContent = msg;
    el.lyrics.appendChild(p);
    if (withFind && cfg.autoLyrics !== false) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn find-btn'; b.textContent = T.findLyrics;
      b.addEventListener('click', () => findLyrics(songs[loadedIndex], loadToken, true));
      el.lyrics.appendChild(b);
    }
    lines = []; lineEls = []; activeLine = -1; timed = false;
  }

  function renderLyricsText(text) {
    const parsed = parseLRC(text);
    if (!parsed.lines.length) { showLyricsNote(T.noLyrics, true); return false; }
    lines = parsed.lines; timed = parsed.timed; activeLine = -1;

    el.lyrics.textContent = '';
    const inner = document.createElement('div');
    inner.className = 'lyrics-inner';
    lineEls = lines.map((l) => {
      const d = document.createElement('div');
      d.className = 'line' + (timed ? ' timed' : '');
      d.textContent = l.text || '♪';
      if (timed) d.addEventListener('click', () => { audio.currentTime = l.t; updateLyrics(true); });
      inner.appendChild(d);
      return d;
    });
    el.lyrics.appendChild(inner);
    el.lyrics.scrollTop = 0;
    updateLyrics(true);
    return true;
  }

  async function loadLyrics(song, token) {
    showLyricsNote('');
    let text = song.lyrics || '';
    // Lyrics saved in this browser (typed with the editor, or found online) win over the file.
    const saved = store.get('lrc:' + song.audio, '');
    if (saved) text = saved;
    // Nothing available: look the song up online, or say there are no lyrics.
    const none = () => {
      if (token !== loadToken) return;
      if (cfg.autoLyrics !== false) findLyrics(song, token, false); else showLyricsNote(T.noLyrics);
    };
    if (!text.trim()) { none(); return; }
    // A single line with no [timestamp] is treated as a file path.
    if (!text.includes('\n') && !/^\s*\[/.test(text)) {
      try {
        const r = await fetch(text.trim());
        if (!r.ok) throw new Error('missing');
        text = await r.text();
      } catch (e) { none(); return; }
      if (!text.trim()) { none(); return; }
    }
    if (token !== loadToken) return;
    renderLyricsText(text);
  }

  /* ---------- Find timed lyrics online (LRCLIB, a free public lyrics database) ---------- */
  const cleanTitle = (t) => t
    .replace(/[\(\[][^\)\]]*[\)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+(feat|ft)\.?\s+.*$/i, '')
    .replace(/\s+/g, ' ').trim();

  async function lrclibSearch(params) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams(params), { signal: ctl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      return (Array.isArray(data) ? data : []).filter((d) => d && d.syncedLyrics);
    } finally { clearTimeout(timer); }
  }

  async function findLyrics(song, token, manual) {
    if (!song) return;
    const missKey = 'lrcmiss:' + song.audio;
    if (!manual) {
      const miss = store.get(missKey, 0);
      if (miss && Date.now() - miss < 3 * 864e5) { showLyricsNote(T.noLyrics, true); return; }
    }
    showLyricsNote(T.searching);
    try {
      const title = cleanTitle(song.title || ''), artist = (song.artist || '').trim();
      let found = await lrclibSearch({ track_name: title, artist_name: artist });
      if (!found.length) found = await lrclibSearch({ q: (artist + ' ' + title).trim() });
      if (token !== loadToken) return;
      if (!found.length) { store.set(missKey, Date.now()); showLyricsNote(T.noLyrics, true); return; }

      // Wait briefly for the song length so we can pick the closest version.
      await new Promise((res) => {
        if (isFinite(audio.duration) && audio.duration > 0) { res(); return; }
        const done = () => { audio.removeEventListener('loadedmetadata', done); res(); };
        audio.addEventListener('loadedmetadata', done);
        setTimeout(done, 4000);
      });
      if (token !== loadToken) return;
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      if (dur) found.sort((a, b) => Math.abs((a.duration || 0) - dur) - Math.abs((b.duration || 0) - dur));
      const best = found[0];
      const diff = dur ? Math.abs((best.duration || 0) - dur) : 0;
      store.set('lrc:' + song.audio, best.syncedLyrics);
      if (renderLyricsText(best.syncedLyrics)) toast(diff > 3 ? T.foundOff : T.found);
    } catch (e) {
      if (token === loadToken) showLyricsNote(T.lyricsOffline, true);
    }
  }

  ['wheel', 'touchmove', 'pointerdown'].forEach((ev) =>
    el.lyrics.addEventListener(ev, () => { userScrollUntil = performance.now() + 3500; }, { passive: true }));

  function centerLine(i, smooth) {
    const n = lineEls[i];
    if (!n) return;
    const top = n.offsetTop - el.lyrics.clientHeight / 2 + n.offsetHeight / 2;
    el.lyrics.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }

  function updateLyrics(force) {
    if (!timed || !lines.length) return;
    const cur = audio.currentTime + 0.12;
    let lo = 0, hi = lines.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].t <= cur) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (idx === activeLine && !force) return;
    activeLine = idx;
    lineEls.forEach((n, i) => {
      const d = Math.abs(i - idx);
      n.classList.toggle('active', d === 0);
      n.classList.toggle('near', d === 1);
    });
    if (idx >= 0 && (force || performance.now() > userScrollUntil)) centerLine(idx, !force);
  }

  /* ---------- Loading and playing songs ---------- */
  function applySongTheme() {
    const s = songs[loadedIndex];
    if (!s) { applyListTheme(); return; }
    const a = s.accent || DEFAULT_ACCENT, a2 = s.accent2 || DEFAULT_ACCENT2;
    setTheme(a, a2);
    setBackground(s.background || null, a, a2);
  }

  function loadSong(i, autoplay) {
    const s = songs[i];
    if (!s) return;
    if (loadedIndex !== -1 && loadedIndex !== i) played.push(loadedIndex);
    loadedIndex = i;
    const token = ++loadToken;

    audio.src = s.audio || '';
    audio.load();

    el.title.textContent = s.title || 'Untitled';
    el.artist.textContent = s.artist || '';
    el.cover.hidden = !s.cover;
    el.cover.onerror = () => { el.cover.hidden = true; };
    if (s.cover) el.cover.src = s.cover;
    el.cover.alt = s.title ? s.title + ' cover' : '';
    el.seek.value = 0; fillRange(el.seek);
    el.tCur.textContent = '0:00'; el.tDur.textContent = '0:00';
    document.title = (s.title || 'Music') + (s.artist ? ' · ' + s.artist : '');

    loadLyrics(s, token);
    markRows();
    setMediaSession(s);
    if (view === 'player') { applySongTheme(); history.replaceState(null, '', '#/play/' + i); }
    if (autoplay) play();
  }

  async function play() {
    ensureGraph();
    try { if (ctx && ctx.state === 'suspended') await ctx.resume(); } catch (e) { /* ignore */ }
    try { await audio.play(); } catch (e) { /* blocked or missing file: error event reports it */ }
  }
  function togglePlay() {
    if (loadedIndex === -1) { if (songs.length) loadSong(0, true); return; }
    if (audio.paused) play(); else audio.pause();
  }
  function nextIndex() {
    if (songs.length < 2) return 0;
    if (shuffle) {
      let n;
      do { n = Math.floor(Math.random() * songs.length); } while (n === loadedIndex);
      return n;
    }
    return (loadedIndex + 1) % songs.length;
  }
  function goNext() { if (songs.length) loadSong(nextIndex(), true); }
  function goPrev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (!songs.length) return;
    let n;
    if (shuffle && played.length) n = played.pop();
    else n = (loadedIndex - 1 + songs.length) % songs.length;
    const keep = played.length;
    loadSong(n, true);
    if (shuffle) played.length = Math.max(0, Math.min(played.length, keep)); // do not re-push when stepping back
  }

  function setPlayUI() {
    const playing = !audio.paused && !audio.ended;
    // SVG elements have no .hidden property, so toggle the attribute itself.
    el.iPlay.toggleAttribute('hidden', playing);
    el.iPause.toggleAttribute('hidden', !playing);
    el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    markRows();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
  audio.addEventListener('play', setPlayUI);
  audio.addEventListener('pause', setPlayUI);
  audio.addEventListener('loadedmetadata', () => { el.tDur.textContent = fmt(audio.duration); });
  audio.addEventListener('durationchange', () => { el.tDur.textContent = fmt(audio.duration); });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) toast(T.loadError); });
  audio.addEventListener('ended', () => {
    if (repeat === 2) { audio.currentTime = 0; play(); return; }
    const last = loadedIndex === songs.length - 1;
    if (shuffle || !last || repeat === 1) goNext();
    else { audio.currentTime = 0; setPlayUI(); }
  });

  function setMediaSession(s) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      const art = s.cover ? [{ src: new URL(s.cover, location.href).href }] : [];
      navigator.mediaSession.metadata = new MediaMetadata({ title: s.title || '', artist: s.artist || '', artwork: art });
    } catch (e) { /* ignore */ }
  }
  if ('mediaSession' in navigator) {
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported */ } };
    set('play', () => play());
    set('pause', () => audio.pause());
    set('previoustrack', goPrev);
    set('nexttrack', goNext);
    set('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  }

  /* ---------- Controls ---------- */
  el.play.addEventListener('click', togglePlay);
  el.next.addEventListener('click', goNext);
  el.prev.addEventListener('click', goPrev);

  el.shuffle.addEventListener('click', () => {
    shuffle = !shuffle;
    el.shuffle.setAttribute('aria-pressed', String(shuffle));
    el.shuffle.setAttribute('aria-label', 'Shuffle ' + (shuffle ? 'on' : 'off'));
    store.set('shuffle', shuffle);
  });
  function paintRepeat() {
    el.repeat.setAttribute('aria-pressed', String(repeat > 0));
    el.repeat.setAttribute('aria-label', ['Repeat off', 'Repeat all', 'Repeat one'][repeat]);
    el.repeatOne.hidden = repeat !== 2;
  }
  el.repeat.addEventListener('click', () => { repeat = (repeat + 1) % 3; paintRepeat(); store.set('repeat', repeat); });

  el.seek.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  el.seek.addEventListener('input', () => {
    fillRange(el.seek);
    if (isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (el.seek.value / 1000) * audio.duration;
      el.tCur.textContent = fmt(audio.currentTime);
      updateLyrics(true);
    }
  });

  el.vol.addEventListener('input', () => { audio.volume = el.vol.value / 100; fillRange(el.vol); store.set('vol', +el.vol.value); });
  // The slider is brightness: further right is brighter, so the dark overlay shrinks.
  const applyBrightness = () => { el.root.style.setProperty('--dim', (0.85 * (1 - el.dim.value / 100)).toFixed(2)); fillRange(el.dim); };
  el.dim.addEventListener('input', () => { applyBrightness(); store.set('bright', +el.dim.value); });

  document.addEventListener('keydown', (e) => {
    if (ed.open) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input') return;
    if (e.code === 'Space' && tag !== 'button' && tag !== 'a') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else if (e.key === 'ArrowUp') { el.vol.value = Math.min(100, +el.vol.value + 5); el.vol.dispatchEvent(new Event('input')); }
    else if (e.key === 'ArrowDown') { el.vol.value = Math.max(0, +el.vol.value - 5); el.vol.dispatchEvent(new Event('input')); }
    else if (e.key === 'n' || e.key === 'N') goNext();
    else if (e.key === 'p' || e.key === 'P') goPrev();
    else if (e.key === 'Escape' && view === 'player') location.hash = '#/';
  });

  /* ---------- Lyrics editor: paste, tap to time, save / download ---------- */
  const ed = {
    open: false, root: $('editor'), paste: $('edPaste'), time: $('edTime'), text: $('edText'),
    lines: $('edLines'), help: $('edHelp'), done: $('edDone'), playBtn: $('edPlay')
  };
  const REACTION = 0.2; // seconds subtracted from each tap to cover reaction time
  let edTexts = [], edStamps = [], edPos = 0;

  const lrcTime = (t) => {
    const cs = Math.round(Math.max(0, t) * 100);
    const m = Math.floor(cs / 6000), s = (cs % 6000) / 100;
    return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0');
  };
  const toLRC = () => edTexts.map((t, i) => '[' + lrcTime(edStamps[i]) + '] ' + t).join('\n');
  const lrcKey = () => 'lrc:' + (songs[loadedIndex] || {}).audio;

  function edOpen() {
    if (loadedIndex < 0) return;
    ed.open = true;
    ed.root.hidden = false;
    ed.paste.hidden = false;
    ed.time.hidden = true;
    ed.text.value = lines.length ? lines.map((l) => l.text).filter((t) => t && t !== '♪').join('\n') : '';
    ed.text.focus();
  }
  function edClose() {
    ed.open = false;
    ed.root.hidden = true;
    ed.paste.hidden = false;
    ed.time.hidden = true;
  }
  function edRender() {
    ed.lines.textContent = '';
    edTexts.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'ed-line' + (i < edPos ? ' done' : '') + (i === edPos ? ' cur' : '');
      const tm = document.createElement('span'); tm.className = 'ed-t';
      tm.textContent = edStamps[i] == null ? '--:--' : lrcTime(edStamps[i]).replace(/^0/, '');
      const tx = document.createElement('span'); tx.textContent = t;
      row.append(tm, tx);
      row.addEventListener('click', () => { edPos = i; for (let k = i; k < edStamps.length; k++) edStamps[k] = null; edRender(); });
      ed.lines.appendChild(row);
    });
    const finished = edPos >= edTexts.length;
    ed.done.hidden = !finished;
    ed.help.textContent = finished
      ? 'All lines are timed. Check the times, then save. Use Earlier / Later if everything is a little off.'
      : 'The song is playing. Press Tap (or Enter) the moment the highlighted line starts being sung. Click a line to redo from there.';
    const cur = ed.lines.children[Math.min(edPos, edTexts.length - 1)];
    if (cur) cur.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function edStart() {
    edTexts = ed.text.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!edTexts.length) { toast('Paste some lyrics first.'); return; }
    edStamps = new Array(edTexts.length).fill(null);
    edPos = 0;
    ed.paste.hidden = true;
    ed.time.hidden = false;
    edRender();
    audio.currentTime = 0;
    play();
  }
  function edTap() {
    if (edPos >= edTexts.length) return;
    edStamps[edPos] = Math.max(0, audio.currentTime - REACTION);
    edPos++;
    edRender();
  }
  function edUndo() {
    if (edPos <= 0) return;
    edPos--;
    edStamps[edPos] = null;
    audio.currentTime = Math.max(0, (edPos > 0 ? edStamps[edPos - 1] : 0));
    edRender();
  }
  function edShift(d) {
    edStamps = edStamps.map((t) => (t == null ? t : Math.max(0, t + d)));
    edRender();
  }
  function edSave() {
    if (edPos < edTexts.length) return;
    store.set(lrcKey(), toLRC());
    toast('Lyrics saved in this browser.');
    edClose();
    loadLyrics(songs[loadedIndex], ++loadToken);
  }
  function edDownload() {
    if (edPos < edTexts.length) return;
    const base = ((songs[loadedIndex].audio || 'lyrics').split('/').pop() || 'lyrics').replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(new Blob([toLRC() + '\n'], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = base + '.lrc';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function edShiftSaved(d) {
    if (!timed || !lines.length) { toast('These lyrics have no timing to shift.'); return; }
    const lrc = lines.map((l) => '[' + lrcTime(l.t + d) + '] ' + l.text).join('\n');
    store.set(lrcKey(), lrc);
    loadLyrics(songs[loadedIndex], ++loadToken);
    toast('Lyrics moved ' + (d < 0 ? 'earlier' : 'later') + ' by ' + Math.abs(d) + 's.');
  }
  function edClearSaved() {
    try { localStorage.removeItem('mp:' + lrcKey()); } catch (e) { /* ignore */ }
    store.set('lrcmiss:' + (songs[loadedIndex] || {}).audio, Date.now());
    toast('Saved lyrics removed.');
    edClose();
    loadLyrics(songs[loadedIndex], ++loadToken);
  }

  $('editBtn').addEventListener('click', edOpen);
  $('editLabel').textContent = T.editLyrics || 'Edit lyrics';
  $('edClose').addEventListener('click', edClose);
  $('edStart').addEventListener('click', edStart);
  $('edClear').addEventListener('click', edClearSaved);
  $('edShiftE').addEventListener('click', () => edShiftSaved(-0.5));
  $('edShiftL').addEventListener('click', () => edShiftSaved(0.5));
  $('edTap').addEventListener('click', edTap);
  $('edUndo').addEventListener('click', edUndo);
  $('edRestart').addEventListener('click', () => { audio.currentTime = 0; play(); });
  $('edMinus').addEventListener('click', () => edShift(-0.1));
  $('edPlus').addEventListener('click', () => edShift(0.1));
  $('edSave').addEventListener('click', edSave);
  $('edDownload').addEventListener('click', edDownload);
  ed.playBtn.addEventListener('click', () => { if (audio.paused) play(); else audio.pause(); });
  audio.addEventListener('play', () => { ed.playBtn.textContent = 'Pause'; });
  audio.addEventListener('pause', () => { ed.playBtn.textContent = 'Play'; });
  ed.root.addEventListener('pointerdown', (e) => { if (e.target === ed.root) edClose(); });
  document.addEventListener('keydown', (e) => {
    if (!ed.open) return;
    if (e.key === 'Escape') { edClose(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || ed.time.hidden) return;
    if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); edTap(); }
    else if (e.key === 'Backspace') { e.preventDefault(); edUndo(); }
  });

  /* ---------- Screens and routing ---------- */
  function showList() {
    view = 'list';
    el.playerPage.classList.remove('active');
    el.listPage.classList.add('active');
    hoverIdx = -1;
    applyListTheme();
    document.title = cfg.siteTitle || 'Moon Waves';
    window.scrollTo(0, 0);
    requestAnimationFrame(refreshClips);
  }
  function showPlayer() {
    view = 'player';
    holdUntil = performance.now() + 4000;
    hoverIdx = -1;
    el.listPage.classList.remove('active');
    el.playerPage.classList.add('active');
    applySongTheme();
    const s = songs[loadedIndex];
    if (s) document.title = (s.title || 'Music') + (s.artist ? ' · ' + s.artist : '');
    window.scrollTo(0, 0);
    if (timed) requestAnimationFrame(() => centerLine(Math.max(activeLine, 0), false));
  }
  function openSong(i) {
    if (i !== loadedIndex) loadSong(i, true);
    else if (audio.paused) play();
    if (location.hash === '#/play/' + i) route(); else location.hash = '#/play/' + i;
  }
  function route() {
    const m = location.hash.match(/^#\/play\/(\d+)$/);
    const i = m ? parseInt(m[1], 10) : -1;
    if (i >= 0 && songs[i]) {
      if (i !== loadedIndex) loadSong(i, false);
      if (view !== 'player') showPlayer();
    } else if (view !== 'list' || !el.listPage.classList.contains('active')) {
      showList();
    }
  }
  window.addEventListener('hashchange', route);

  /* ---------- Frame loop: progress, lyrics, beat glow ---------- */
  let pulse = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (view !== 'player') return;
    const playing = !audio.paused && !audio.ended;
    let target = 0;
    if (playing) {
      if (analyser) {
        analyser.getByteFrequencyData(freq);
        let s = 0;
        for (let k = 1; k < 7; k++) s += freq[k];
        target = Math.min(1, Math.pow(s / 6 / 255, 1.7) * 1.35);
      } else {
        target = 0.2 + 0.12 * Math.sin(t / 340);
      }
    }
    pulse += (target - pulse) * (target > pulse ? 0.35 : 0.08);
    el.card.style.setProperty('--pulse', pulse.toFixed(3));

    if (!dragging && isFinite(audio.duration) && audio.duration > 0) {
      el.seek.value = Math.round(audio.currentTime / audio.duration * 1000);
      fillRange(el.seek);
      el.tCur.textContent = fmt(audio.currentTime);
    }
    updateLyrics(false);
  }

  /* ---------- Boot ---------- */
  shuffle = !!store.get('shuffle', false);
  repeat = store.get('repeat', 0) | 0;
  el.shuffle.setAttribute('aria-pressed', String(shuffle));
  el.shuffle.setAttribute('aria-label', 'Shuffle ' + (shuffle ? 'on' : 'off'));
  paintRepeat();
  el.vol.value = store.get('vol', 80);
  el.dim.value = store.get('bright', 60);
  audio.volume = el.vol.value / 100;
  applyBrightness();
  fillRange(el.vol); fillRange(el.seek);

  renderList();
  showLyricsNote(T.noLyrics);
  // First paint: show the list, then follow the address bar if it points at a song.
  el.listPage.classList.add('active');
  applyListTheme();
  document.title = cfg.siteTitle || 'Moon Waves';
  route();
  requestAnimationFrame(refreshClips);
  window.addEventListener('resize', refreshClips);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshClips);
  requestAnimationFrame(frame);
})();
