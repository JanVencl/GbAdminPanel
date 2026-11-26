import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the backend runs on :8080; /api is proxied to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:8080" },
  },
});
