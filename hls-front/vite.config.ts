import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths"; // 추가
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()], // tsconfigPaths 추가
});
