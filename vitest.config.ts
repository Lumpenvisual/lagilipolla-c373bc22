import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Standalone Vitest config. We intentionally do NOT reuse vite.config.ts because
// it loads the full TanStack Start / Nitro plugin stack, which is unnecessary
// (and slow) for pure unit tests of business logic.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
