import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "/tiller",
  basePath: "/tiller",
  // 16.3: run the React Compiler through Turbopack's native Rust pass instead
  // of the Babel plugin, so no Babel step is needed in the build.
  experimental: { turbopackRustReactCompiler: true },
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
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
