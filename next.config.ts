import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The generated Prisma client is TypeScript source that imports with explicit
  // .ts extensions; keep it out of the client bundle and let the server
  // externalise the query engine.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
