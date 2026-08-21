import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// outDir: ../dist — served by the Worker's ASSETS binding. See docs/SCAFFOLDING.md §1-2.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
