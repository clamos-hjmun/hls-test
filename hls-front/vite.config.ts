import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths"; // 추가
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5000,
  },
  plugins: [react(), tsconfigPaths()], // tsconfigPaths 추가
});
