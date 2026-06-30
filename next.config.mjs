/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep ffmpeg-static out of the bundler so its runtime path resolution stays intact.
  serverExternalPackages: ["ffmpeg-static"],
  // Ensure the ffmpeg binary is traced into the transcribe serverless function.
  outputFileTracingIncludes: {
    "/api/transcribe": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
    ],
  },
}

export default nextConfig
