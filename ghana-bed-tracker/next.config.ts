import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sandbox / staging previews are served from an *.e2b.app host.
  allowedDevOrigins: ["*.e2b.app", "localhost"],
  // node:sqlite, nodemailer and web-push must stay out of the bundler and be
  // required from node_modules at runtime.
  serverExternalPackages: ["node:sqlite", "nodemailer", "web-push"],
};

export default nextConfig;
