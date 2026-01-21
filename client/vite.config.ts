import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { imagetools } from "vite-imagetools";
import viteCompression from "vite-plugin-compression";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    imagetools(),
    viteCompression({ algorithm: "brotliCompress", ext: ".br" }),
    viteCompression({ algorithm: "gzip" }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@assets": fileURLToPath(new URL("./src/assets", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "wouter"],
          ui: ["@tanstack/react-query", "lucide-react"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react-icons/fa", "react-icons/fa6"],
  },
  ssr: {
    noExternal: ["react-icons"],
  },
});
