import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // sockjs-client asume que existe el objeto `global` de Node (para su
  // fallback de transporte), que Vite no polyfillea por defecto en el
  // navegador. Sin esto, la app no carga ("global is not defined").
  define: {
    global: "globalThis",
  },
});
