import { existsSync } from "node:fs"
import { join } from "node:path"
import ffmpegStaticPath from "ffmpeg-static"

export function resolveFfmpegPath(): string | null {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH

  const vendorPath = join(process.cwd(), "vendor", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
  if (existsSync(vendorPath)) return vendorPath

  return typeof ffmpegStaticPath === "string" ? ffmpegStaticPath : null
}
