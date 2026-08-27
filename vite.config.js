import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      ignored: ["**/_chrome_verify_profile/**"],
    },
  },
});
