import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "/tiller",
  basePath: "/tiller",
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
