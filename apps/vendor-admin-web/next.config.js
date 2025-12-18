/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@countrtop/ui', '@countrtop/models', '@countrtop/api-client', '@countrtop/data']
};

module.exports = nextConfig;
