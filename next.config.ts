import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    ignoreIssue: [
      { path: "**/*", title: "Encountered unexpected file in NFT list" },
    ],
  },
  experimental: {
    // Limit build parallelism to prevent SQLite SQLITE_BUSY errors —
    // multiple worker processes each load lib/db.ts and run schema
    // migrations simultaneously against the same database file.
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 999,
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
