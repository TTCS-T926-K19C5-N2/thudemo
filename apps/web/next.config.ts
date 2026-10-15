import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/auth/login",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
