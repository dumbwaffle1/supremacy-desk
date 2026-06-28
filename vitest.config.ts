import { defineConfig } from "vitest/config";

// convex-test runs functions in an edge-runtime sandbox.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
