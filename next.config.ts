import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The server this deploys to is a 6.7 GB box that also runs Odoo and
     Postgres, and it has already lost Postgres once to a full disk. A normal
     deployment would need `node_modules` up there — 436 MB, which simply does
     not fit. Standalone output traces only the files the app actually loads
     and emits a self-contained folder with its own `server.js`, so the server
     needs no npm and a fraction of the space. */
  output: "standalone",

  /* Served under a path, not a port. On the AWS box nginx owns :80 and proxies
     everything to Odoo, and the security group has every other port shut — so
     the PMS lives at /pms and nginx routes that prefix to it. `basePath` makes
     Next emit its own links and assets under the same prefix, which is what
     stops the app loading but rendering unstyled. Overridable so a local run
     stays at the root. */
  basePath: process.env.PMS_BASE_PATH ?? "",
};

export default nextConfig;
