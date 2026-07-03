import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { devApi } from "./vite-plugins/dev-api"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  server: {
    // Listen on all interfaces so phones on the LAN / tunnels can reach it.
    host: true,
    // Allow Cloudflare quick-tunnel hostnames (*.trycloudflare.com) so the
    // dev server doesn't reject proxied requests with "host not allowed".
    allowedHosts: [".trycloudflare.com"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
