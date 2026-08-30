import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generated Prisma client is TypeScript source that imports with explicit
  // .ts extensions; keep it out of the client bundle and let the server
  // externalise the query engine.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

  experimental: {
    // A server action's body defaults to 1 MB, and an uploaded workbook is one:
    // the company sheet exports at about 140 KB today and a fuller plan will be
    // larger. Matched to MAX_FILE_BYTES in lib/import/read.ts, which refuses
    // anything bigger with a message rather than a framework error.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
