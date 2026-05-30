import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        lyrics: resolve(__dirname, "lyrics.html"),
        lyricsSettings: resolve(__dirname, "lyrics-settings.html"),
        settings: resolve(__dirname, "settings.html"),
        toolbar: resolve(__dirname, "toolbar.html"),
      },
    },
  },
});
