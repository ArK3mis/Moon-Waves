/* ============================================================
   YOUR SETTINGS. Edit this file to personalise the site.
   ============================================================ */

window.PLAYER_CONFIG = {
  // Text shown on screen. Change the words to any language you like.
  strings: {
    songList: "Moon Waves",
    back: "Back",
    noLyrics: "No lyrics for this song yet.",
    loadError: "Couldn't load this song. Check the file path in songs.js.",
    empty: "No songs yet. Add some in songs.js."
  },

  // Look up timed lyrics online (lrclib.net) for songs that have none. Set to false to turn off.
  // The visitor's browser sends only the song title and artist to that site.
  autoLyrics: true,

  // Name of the site (browser tab title).
  siteTitle: "Moon Waves",

  // Small line under the player. Leave "" for nothing.
  footer: "",

  // Colours. Any hex colour works; each song can also set its own accent / accent2.
  accent: "#ff2d55",   // red
  accent2: "#8b5cf6",  // violet (mixed with the red in glows and buttons)

  // Background behind the song list.
  // Use a video (.mp4 / .webm), an image (.jpg / .png / .webp), or null for the animated gradient.
  listBackground: null,

  songs: [
    {
      title: "Lady Killers II (Christoph Andersson Remix)",
      artist: "G-Eazy",
      cover: "assets/covers/lady-killers-ii.jpg",
      audio: "assets/audio/lady-killers-ii.mp3",
      background: "assets/backgrounds/lady-killers-ii.mp4",
      accent: "#ff2d55",
      // Timed lyrics go in assets/lyrics/lady-killers-ii.lrc (currently empty).
      // Each line looks like:  [01:23.45] the words sung at that moment
      lyrics: "assets/lyrics/lady-killers-ii.lrc"
    },
    {
      title: "I Don't Love You",
      artist: "My Chemical Romance",
      cover: "assets/covers/i-dont-love-you.jpg",
      audio: "assets/audio/i-dont-love-you.m4a",
      background: "assets/backgrounds/i-dont-love-you.mp4",
      accent: "#a855f7",
      accent2: "#ff2d55",
      lyrics: "assets/lyrics/i-dont-love-you.lrc"
    }
  ]
};
