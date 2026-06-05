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
        settings: resolve(__dirname, "settings.html"),
        windowManager: resolve(__dirname, "window-manager.html"),
        toolbar: resolve(__dirname, "toolbar.html"),
      },
    },
  },
});
