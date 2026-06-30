/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep native packages out of the bundler so their runtime path resolution stays intact.
  serverExternalPackages: ["ffmpeg-static", "onnxruntime-node"],
  // Ensure the ffmpeg binary, the Silero VAD model, and the onnxruntime native
  // binaries are traced into the transcribe serverless function.
  outputFileTracingIncludes: {
    "/api/transcribe": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
      "./models/silero_vad.onnx",
      "./node_modules/onnxruntime-node/bin/**/*",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/**/*",
    ],
  },
}

export default nextConfig
