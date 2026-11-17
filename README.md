# My Music: personal music player site

A static website (no build step) with a song list, a player with synced lyrics,
per-song looping backgrounds, and a glow that pulses with the music.

## What is in this folder

```
index.html      page structure
style.css       all the visuals
script.js       player logic (you rarely need to touch this)
songs.js        YOUR SETTINGS: songs, covers, backgrounds, lyrics, text
assets/
  audio/        your songs (mp3, m4a, ogg, wav)
  covers/       cover images (jpg, png, webp, svg)
  backgrounds/  looping videos (mp4, webm) or images
  lyrics/       optional .lrc lyric files
```

The three songs, covers and lyrics in there now are placeholders.

## Adding your own songs

1. Copy your files into the matching `assets/` folders.
2. Open `songs.js` and add or edit an entry:

```js
{
  title: "Song name",
  artist: "Artist",
  cover: "assets/covers/my-song.jpg",
  audio: "assets/audio/my-song.mp3",
  background: "assets/backgrounds/my-song.mp4",   // or an image, or null for the gradient
  accent: "#ff3366",                              // glow colour for this song (optional)
  lyrics: "assets/lyrics/my-song.lrc"             // or paste timed lyrics text, or ""
}
```

Songs appear in the list in the order they are written.

### Backgrounds
- `listBackground` in `songs.js` is the background of the song list screen.
- Each song's `background` shows while it is open. Use `null` for the animated gradient.
- Videos play muted and loop. Use `.mp4` (H.264) or `.webm`.
- Keep videos small, a few MB each, because they load on every visit. This command shrinks one:

```
ffmpeg -i input.mp4 -an -vf "scale=-2:720,fps=30" -c:v libx264 -crf 28 -preset slow -movflags +faststart output.mp4
```

### Lyrics
Lyrics use the common `.lrc` format, one line per timestamp:

```
[00:12.50] First line of the song
[00:17.00] Second line
```

You can write your own timing or find the `.lrc` file for a song online. Put it in
`assets/lyrics/` and point to it, or paste the text straight into `songs.js` between backticks.
Lyrics without timestamps are shown as plain text, with no highlighting.
Click any lyric line to jump to that moment.

### Automatic lyrics
When a song has no lyrics, the page looks them up on lrclib.net (a free public lyrics database), picks the
version closest to your song's length, and saves them in the visitor's browser. Only the song title and
artist are sent to that site. If nothing is found, a **Find lyrics online** button lets you retry.
Turn this off with `autoLyrics: false` in `songs.js`. Remix timing often differs from the original, so
use **Edit lyrics** then **Earlier / Later 0.5s** to nudge it.

### Timing lyrics yourself (Edit lyrics button)
Open a song and press **Edit lyrics** at the top right of the player.
1. Paste the lyrics, one line per row, and press Start timing. The song plays from the start.
2. Press **Tap** (or Enter) the moment each highlighted line starts being sung. Backspace or Undo steps back.
3. Use Earlier / Later 0.1s if everything is slightly off, then press **Save**.

Saved lyrics live in your own browser, so they work on that device straight away. To make them
show for every visitor after you deploy, press **Download .lrc** and replace the file in
`assets/lyrics/` with the download (for example `assets/lyrics/lady-killers-ii.lrc`), then redeploy.

### Changing the words on screen
Edit `strings` in `songs.js` (for example `songList: "Daftar Lagu"`, `back: "Kembali"`).

## Preview on your computer

Open the folder in VS Code and use the Live Server extension (Open with Live Server),
or run `python3 -m http.server` in this folder and open http://localhost:8000.
Opening `index.html` by double-clicking mostly works, but lyric files and the
beat-reactive glow need a server.

## Put it on Vercel

Option A, with GitHub:
1. Create a new GitHub repository and upload everything in this folder to it.
2. Go to vercel.com, choose Add New, then Project, and import the repository.
3. Leave Framework Preset as "Other", leave Build Command and Output Directory empty, and click Deploy.

Option B, with the command line: run `npx vercel` inside this folder and answer the prompts.

Every time you change a file and push to GitHub, Vercel redeploys automatically.

Only upload music and videos you have the right to share publicly, because anyone with the link can download them.

## Keyboard shortcuts
Space play/pause · Left/Right seek 5s · Up/Down volume · N next · P previous · Esc back to the list
