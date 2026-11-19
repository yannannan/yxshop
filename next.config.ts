import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep SEO in the initial HTML head for browsers and crawlers, including
  // engines that do not execute JavaScript to move streamed metadata.
  htmlLimitedBots: /.*/,
  experimental: {
    serverActions: {
      bodySizeLimit: '510mb',
    },
  },
};

export default nextConfig;
