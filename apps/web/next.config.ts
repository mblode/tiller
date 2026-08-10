import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * PostHog is reverse-proxied through r.blode.co, and posthog-js lazy-loads its
 * extension bundles from `api_host`, so the origin belongs in `script-src` as
 * well as `connect-src`.
 *
 * The fallback is the deployed proxy rather than "": this file is evaluated at
 * build time, and an env var that is only bound on production would otherwise
 * ship previews a CSP that silently blocks analytics.
 */
const posthogOrigin =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://r.blode.co";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' is not optional: Next inlines the RSC flight payload as a
  // <script>. 'unsafe-eval' is dev-only, for the Turbopack HMR runtime.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${posthogOrigin}`,
  `connect-src 'self' ${posthogOrigin}`,
  // blob: covers anything the game canvas hands back through
  // URL.createObjectURL; data: covers inline canvas snapshots.
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * blode.co deliberately skips zone paths in its own `headers()`, because two
 * Content-Security-Policy headers on one response are intersected by the
 * browser rather than overridden. So this zone owns its response headers.
 *
 * No `Cross-Origin-Resource-Policy`: `same-origin` would need a `cross-origin`
 * override on every OG route, and missing one kills a share card silently.
 * HSTS is already set at the edge.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  assetPrefix: "/tiller",
  basePath: "/tiller",
  // 16.3: run the React Compiler through Turbopack's native Rust pass instead
  // of the Babel plugin, so no Babel step is needed in the build.
  experimental: { turbopackRustReactCompiler: true },
  headers() {
    // Every matching rule applies in array order and a later one wins per
    // header key, so a catch-all must come first or it overwrites the
    // per-path rules after it.
    //
    // `/:path*` rather than `/(.*)`: `headers` sources are basePath-prefixed,
    // and `/tiller/(.*)` does not match the bare `/tiller` the zone rewrite
    // actually requests. The `*` modifier makes the segment optional, so
    // `/tiller/:path*` covers the zone root as well as everything under it.
    return Promise.resolve([
      {
        headers: securityHeaders,
        source: "/:path*",
      },
    ]);
  },
  reactCompiler: true,
  redirects() {
    return Promise.resolve([
      {
        basePath: false,
        destination: "https://blode.co/tiller",
        has: [{ type: "host" as const, value: "tiller.blode.co" }],
        permanent: true,
        source: "/",
      },
      {
        basePath: false,
        destination: "https://blode.co/tiller/:path*",
        has: [{ type: "host" as const, value: "tiller.blode.co" }],
        permanent: true,
        source: "/:path*",
      },
    ]);
  },
};

export default nextConfig;
