import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // The integration suite shares one database, so it runs serially.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), ".") },
  },
});
