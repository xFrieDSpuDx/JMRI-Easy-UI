import { defineConfig } from "vite";

// We keep the project root as the web/ folder itself.
// Build goes to web/dist (no Java changes needed).
export default defineConfig({
  root: ".", // current folder (web/)
  base: "/easy/", // so built asset URLs work under http://.../easy/
  build: {
    outDir: "dist", // web/dist
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    open: false,
  },
});
