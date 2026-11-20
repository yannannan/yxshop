import type { NextConfig } from 'next';
import { technicalImageAssets } from './lib/technical-images';

const nextConfig: NextConfig = {
  // Keep SEO in the initial HTML head for browsers and crawlers, including
  // engines that do not execute JavaScript to move streamed metadata.
  htmlLimitedBots: /.*/,
  async headers() {
    return technicalImageAssets.map(source => ({ source, headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }));
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '510mb',
    },
  },
};

export default nextConfig;
