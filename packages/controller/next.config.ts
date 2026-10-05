import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Everything the app loads is same-origin (fonts are self-hosted by next/font).
// Inline scripts stay allowed for Next's bootstrap and next-themes; dev also
// needs eval for React Refresh.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Ignored by browsers over plain HTTP, so harmless on a LAN install.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Reset/invite links carry tokens in the URL: never leak them as a Referer.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // @cbm/shared ships TS/ESM source consumed directly.
  transpilePackages: ["@cbm/shared"],
  output: "standalone",
  serverExternalPackages: ["pg", "ssh2", "ssh2-sftp-client", "@aws-sdk/client-s3", "nodemailer"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
