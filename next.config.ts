import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    ignoreIssue: [
      { path: "**/*", title: "Encountered unexpected file in NFT list" },
    ],
  },
  experimental: {
    // Single worker prevents SQLite SQLITE_BUSY errors during build —
    // multiple workers open the same database file simultaneously for
    // schema migrations, and SQLite can't handle that.
    staticGenerationMaxConcurrency: 1,
  },
};

export default nextConfig;
