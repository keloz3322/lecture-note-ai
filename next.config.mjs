/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/api/transcribe": [
      "./vendor/ffmpeg",
      "./vendor/ffmpeg.exe",
    ],
  },
}

export default nextConfig
