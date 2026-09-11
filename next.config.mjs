/** @type {import('next').NextConfig} */

// Android builds run with NEXT_EXPORT=1: static export to ./out for the APK.
// Vercel builds run plain: normal server build with the /api routes intact.
const isExport = process.env.NEXT_EXPORT === "1";

const nextConfig = {
  ...(isExport ? { output: "export" } : {}),
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
