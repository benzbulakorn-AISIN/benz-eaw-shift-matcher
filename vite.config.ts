import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// base ต้องตรงกับชื่อ Repository บน GitHub Pages
export default defineConfig({
  base: "/benz-eaw-shift-matcher/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Benz & Eaw Shift Matcher",
        short_name: "Benz & Eaw",
        description: "ตารางงานและเวลาว่างตรงกันของ Benz & Eaw",
        lang: "th",
        start_url: "/benz-eaw-shift-matcher/",
        scope: "/benz-eaw-shift-matcher/",
        display: "standalone",
        background_color: "#0F172A",
        theme_color: "#0F172A",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { navigateFallback: "index.html", cleanupOutdatedCaches: true },
    }),
  ],
});
