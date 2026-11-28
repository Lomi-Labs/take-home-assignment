import type { NextConfig } from "next";

// Server-only: the browser always calls same-origin /api and Next forwards it to the Express service.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
    output: "standalone",
    async rewrites() {
        return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
    },
};

export default nextConfig;
