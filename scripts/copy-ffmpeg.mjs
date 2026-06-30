import { mkdir, copyFile, chmod } from "node:fs/promises"
import { dirname, join } from "node:path"
import ffmpegPath from "ffmpeg-static"

if (!ffmpegPath) {
  throw new Error("ffmpeg-static did not provide a binary path.")
}

const targetPath = join(process.cwd(), "vendor", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")

await mkdir(dirname(targetPath), { recursive: true })
await copyFile(ffmpegPath, targetPath)

if (process.platform !== "win32") {
  await chmod(targetPath, 0o755)
}

console.log(`Copied ffmpeg binary to ${targetPath}`)
