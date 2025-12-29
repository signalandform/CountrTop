/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@countrtop/models', '@countrtop/data', '@countrtop/ui', '@countrtop/api-client'],
  webpack: (config, { isServer }) => {
    // Exclude React Native and Expo modules from webpack bundling for web builds
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'react-native$': 'react-native-web',
      };
      
      // Ignore expo-image in web builds
      config.resolve.fallback = {
        ...config.resolve.fallback,
      };
      
      // Ignore expo-image and react-native modules in web builds
      config.resolve.alias = {
        ...config.resolve.alias,
        'expo-image': false,
        'react-native': false,
      };
    }
    
    return config;
  },
};

module.exports = nextConfig;
