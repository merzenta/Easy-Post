/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/api/shipping-rates/v1/getRates/v1/getRates',
        destination: '/api/shipping-rates/v1/getRates',
      },
      {
        source: '/api/shipping-rates',
        destination: '/api/shipping-rates/v1/getRates',
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
