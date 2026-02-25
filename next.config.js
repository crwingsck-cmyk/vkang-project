/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['firebase', 'firebase-admin'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.firebase.com',
      },
      {
        protocol: 'https',
        hostname: '**.firebaseusercontent.com',
      },
    ],
  },
  // Suppress prerendering errors for client-only pages
  onDemandEntries: {
    maxInactiveAge: 60000,
    pagesBufferLength: 5,
  },
};

module.exports = nextConfig;
