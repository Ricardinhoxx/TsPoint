/** @type {import('next').NextConfig} */
const nextConfig = {
  // OneDrive on Windows can throw EINVAL on readlink while Next cleans `.next`.
  // Keep previous artifacts to avoid startup crashes in dev/build clean phases.
  cleanDistDir: false,
  webpack: (config, { dev }) => {
    // OneDrive/AV can interfere with filesystem cache under `.next/cache`,
    // causing random ENOENT/EINVAL errors on Windows. Disable cache in dev.
    if (dev) config.cache = false;
    return config;
  }
};

export default nextConfig;
