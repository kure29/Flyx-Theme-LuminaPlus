import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// FLYX 在 /status/ 下提供状态页主题，资源路径都要带这个前缀。
// 开发时把 /api 代理到本地面板后端（go run ./cmd/paneld，默认 :6365），
// 可用 FLYX_API 指向其他地址；不想起后端时打开 /status/?mock=1 用模拟数据。
export default defineConfig({
  base: "/status/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: process.env.FLYX_API || "http://127.0.0.1:6365",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // 与 CSS 实际基线对齐:全站大量 color-mix()/oklch(需 Chrome 111 / Safari 16.2+),
    // JS 没必要为更老的引擎转译。
    target: ["es2022", "chrome111", "safari16.2", "firefox113"],
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (!normalized.includes("/node_modules/")) return;

          if (
            /\/node_modules\/(?:react|react-dom|react-router|react-router-dom)\//.test(
              normalized,
            )
          ) {
            return "react";
          }
          if (normalized.includes("/node_modules/@tanstack/react-query/")) {
            return "query";
          }
          if (/\/node_modules\/(?:uplot|uplot-react)\//.test(normalized)) {
            return "charts";
          }
          if (normalized.includes("/node_modules/zod/")) {
            return "validation";
          }
        },
      },
    },
  },
});
