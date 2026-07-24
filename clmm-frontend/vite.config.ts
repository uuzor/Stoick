import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["5175-il67au4q2eod8w7vzdwma.e2b.app"],
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer", "@stellar/stellar-sdk"],
  },
});
