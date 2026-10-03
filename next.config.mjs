/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Compile only the parts of these libraries that are actually imported (faster dev compiles).
    optimizePackageImports: ['lucide-react', 'recharts', 'chart.js', 'date-fns'],
  },
};

export default nextConfig;
