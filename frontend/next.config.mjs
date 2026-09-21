/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.31.21", "192.168.31.116", "JKLCHEN"],
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/account-center",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
