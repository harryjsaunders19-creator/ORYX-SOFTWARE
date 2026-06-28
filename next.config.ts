import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy server-only packages out of the webpack bundle — they are
  // loaded as native Node.js modules directly in the serverless runtime.
  serverExternalPackages: ["better-sqlite3", "exceljs", "pdf-lib", "@pdf-lib/fontkit"],

  turbopack: {
    ignoreIssue: [
      { path: "**/*", title: "Encountered unexpected file in NFT list" },
    ],
  },

  experimental: {
    // Tree-shake icon/date libraries more aggressively — avoids pulling the
    // entire package into every client chunk that imports even one symbol.
    optimizePackageImports: ["lucide-react", "date-fns"],

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
