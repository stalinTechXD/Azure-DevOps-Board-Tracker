import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works on GitHub Pages under /<repo>/ without
// hardcoding the repository name. Combined with HashRouter for SPA routing.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
