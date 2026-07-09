/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { '/api/ask': ['./data/laws_meta.json'] },
};
export default nextConfig;
