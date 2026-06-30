import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getExtension } from "@/lib/format"
import { resolveFfmpegPath } from "@/lib/ffmpeg-path"
import { VIDEO_EXTENSIONS } from "@/lib/types"

const ffmpegPath = resolveFfmpegPath()

/**
 * Decide whether a file should be re-encoded before sending to Groq.
 * - Any video container is always re-encoded (we only need the audio track).
 * - Audio over the threshold is re-encoded to shrink it under Groq's limit.
 */
export function shouldReencode(fileName: string, contentType: string, size: number, threshold: number): boolean {
  return isVideoInput(fileName, contentType) || size > threshold
}

export function isVideoInput(fileName: string, contentType: string): boolean {
  if (contentType.startsWith("video/")) return true
  if (contentType.startsWith("audio/")) return false
  const ext = getExtension(fileName)
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * Re-encode arbitrary audio/video input into a compact Opus file
 * (mono, 16kHz, 32kbps) suitable for speech transcription.
 * Returns the encoded bytes.
 */
export async function reencodeToOpus(input: Buffer, sourceName: string): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error("오디오 인코딩 도구(ffmpeg)를 찾을 수 없습니다.")
  }

  const dir = await mkdtemp(join(tmpdir(), "transcript-"))
  const inputPath = join(dir, `input${safeExtension(sourceName)}`)
  const outputPath = join(dir, "output.opus")

  try {
    await writeFile(inputPath, input)
    await runFfmpeg(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn", // drop any video stream
      "-ac",
      "1", // mono
      "-ar",
      "16000", // 16kHz
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-f",
      "ogg",
      outputPath,
    ])
    return await readFile(outputPath)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Read the media duration (seconds) by parsing ffmpeg's metadata output.
 * Returns null if it cannot be determined. Duration is independent of any later
 * re-encoding, so we probe the original input.
 */
export async function probeDurationSeconds(input: Buffer, sourceName: string): Promise<number | null> {
  if (!ffmpegPath) return null

  const dir = await mkdtemp(join(tmpdir(), "probe-"))
  const inputPath = join(dir, `input${safeExtension(sourceName)}`)

  try {
    await writeFile(inputPath, input)
    // `ffmpeg -i <file>` with no output prints the "Duration:" line to stderr and
    // exits non-zero ("no output specified"); we only need that metadata line.
    const stderr = await captureFfmpegStderr(ffmpegPath, ["-hide_banner", "-i", inputPath])
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!match) return null
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number.parseFloat(match[3])
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function safeExtension(fileName: string): string {
  const ext = getExtension(fileName)
  return /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""
}

/** Run ffmpeg and resolve with its stderr text regardless of exit code. */
function captureFfmpegStderr(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args)
    let stderr = ""
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    proc.on("error", (err) => reject(err))
    proc.on("close", () => resolve(stderr))
  })
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args)
    let stderr = ""

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    proc.on("error", (err) => reject(err))
    proc.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`오디오 인코딩에 실패했습니다. (ffmpeg exit ${code}) ${stderr.slice(0, 300)}`))
      }
    })
  })
}
