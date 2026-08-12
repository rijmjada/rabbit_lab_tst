import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Rutas relativas en vez de absolutas: así el build funciona sin cambios
  // sin importar en qué repo/subpath termine alojado (GitHub Pages, Netlify,
  // Vercel, o abriendo el HTML directo) — no hace falta saber de antemano
  // el nombre del repo ni tocar esto si se muda de lugar.
  base: "./",
});
