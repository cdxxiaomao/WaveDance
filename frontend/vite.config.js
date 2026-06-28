import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        lyrics: resolve(__dirname, "lyrics.html"),
        cover: resolve(__dirname, "cover.html"),
        coverSettings: resolve(__dirname, "cover-settings.html"),
        songinfo: resolve(__dirname, "songinfo.html"),
        songinfoSettings: resolve(__dirname, "songinfo-settings.html"),
        lyricsSettings: resolve(__dirname, "lyrics-settings.html"),
        lyricsSearch: resolve(__dirname, "lyrics-search.html"),
        settings: resolve(__dirname, "settings.html"),
        espDisplaySettings: resolve(__dirname, "esp-display-settings.html"),
        windowManager: resolve(__dirname, "window-manager.html"),
        musicPlatformLogin: resolve(__dirname, "music-platform-login.html"),
        musicPlaylist: resolve(__dirname, "music-playlist.html"),
        musicPlayer: resolve(__dirname, "music-player.html"),
        musicPlayerQueue: resolve(__dirname, "music-player-queue.html"),
        playerSettings: resolve(__dirname, "player-settings.html"),
        toolbar: resolve(__dirname, "toolbar.html"),
      },
    },
  },
});
