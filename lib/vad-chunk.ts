import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveFfmpegPath } from "@/lib/ffmpeg-path"
import { getExtension } from "@/lib/format"

// Lightweight serverless-friendly chunking. Avoid native ML runtimes here:
// large native binaries can push the Vercel Function bundle over its size limit.
const FRAME_SEC = 0.5
const ffmpegPath = resolveFfmpegPath()

export interface AudioChunk {
  index: number
  startSec: number
  endSec: number
}

interface SilenceRange {
  start: number
  end: number
}

/** Write the original media to a temp file once; reuse for probe/splitting/extract. */
export async function createInputFile(
  input: Buffer,
  sourceName: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "chunk-"))
  const path = join(dir, `input${safeExtension(sourceName)}`)
  await writeFile(path, input)
  return {
    path,
    cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
  }
}

/**
 * Compute silence scores using ffmpeg's silencedetect filter.
 * Scores are low during detected silence and high during speech/noise, which lets
 * planChunks place boundaries near quiet regions without shipping a native ML runtime.
 */
export async function computeSilenceScores(inputPath: string, totalDuration: number): Promise<Float32Array> {
  if (!ffmpegPath) throw new Error("ffmpeg is not available for audio splitting.")
  if (!existsSync(inputPath) || totalDuration <= 0) return new Float32Array([1])

  const stderr = await captureFfmpegStderr(ffmpegPath, [
    "-hide_banner",
    "-nostats",
    "-i",
    inputPath,
    "-af",
    "silencedetect=noise=-35dB:d=0.25",
    "-f",
    "null",
    "-",
  ])

  const frameCount = Math.max(1, Math.ceil(totalDuration / FRAME_SEC))
  const scores = new Float32Array(frameCount)
  scores.fill(1)

  for (const range of parseSilences(stderr, totalDuration)) {
    const startFrame = clampFrame(frameCount, Math.floor(range.start / FRAME_SEC))
    const endFrame = clampFrame(frameCount, Math.ceil(range.end / FRAME_SEC))
    for (let i = startFrame; i <= endFrame; i++) scores[i] = 0
  }

  return scores
}

/**
 * Plan chunk boundaries from silence scores. Each chunk targets `targetSeconds`
 * and never exceeds `maxSeconds`. The cut is placed at the quietest point within
 * a search window around the target, falling back to a near-target cut when the
 * audio is continuous speech.
 */
export function planChunks(
  scores: Float32Array,
  totalDuration: number,
  targetSeconds: number,
  maxSeconds: number,
): AudioChunk[] {
  const chunks: AudioChunk[] = []
  if (totalDuration <= 0) return chunks

  const smooth = smoothScores(scores, 3)
  const searchRadius = 20
  const tieLambda = 0.02

  let start = 0
  let index = 0
  while (start < totalDuration - 0.05 && index < 10000) {
    const remaining = totalDuration - start
    if (remaining <= maxSeconds) {
      chunks.push({ index: index++, startSec: start, endSec: totalDuration })
      break
    }

    const ideal = start + targetSeconds
    const windowStart = Math.max(start + targetSeconds - searchRadius, start + 1)
    const windowEnd = Math.min(start + maxSeconds, totalDuration, ideal + searchRadius)
    const cut = findValley(smooth, windowStart, windowEnd, ideal, tieLambda)
    const safeCut = cut > start + 0.5 ? cut : Math.min(start + maxSeconds, totalDuration)
    chunks.push({ index: index++, startSec: start, endSec: safeCut })
    start = safeCut
  }

  return chunks
}

/** Extract a [startSec, endSec) slice of the input and encode it to Opus (16kHz mono 32kbps). */
export async function extractChunkOpus(inputPath: string, startSec: number, endSec: number): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg is not available for audio chunk encoding.")
  const duration = Math.max(endSec - startSec, 0.1)
  const dir = await mkdtemp(join(tmpdir(), "chunk-out-"))
  const outputPath = join(dir, "chunk.opus")
  try {
    await runFfmpeg(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      startSec.toFixed(3),
      "-i",
      inputPath,
      "-t",
      duration.toFixed(3),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
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

function parseSilences(stderr: string, totalDuration: number): SilenceRange[] {
  const ranges: SilenceRange[] = []
  let currentStart: number | null = null

  for (const line of stderr.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*([0-9.]+)/)
    if (start) {
      currentStart = Number.parseFloat(start[1])
      continue
    }

    const end = line.match(/silence_end:\s*([0-9.]+)/)
    if (end && currentStart != null) {
      const parsedEnd = Number.parseFloat(end[1])
      if (Number.isFinite(currentStart) && Number.isFinite(parsedEnd) && parsedEnd > currentStart) {
        ranges.push({ start: currentStart, end: Math.min(parsedEnd, totalDuration) })
      }
      currentStart = null
    }
  }

  if (currentStart != null && currentStart < totalDuration) {
    ranges.push({ start: currentStart, end: totalDuration })
  }

  return ranges
}

function findValley(
  smooth: Float32Array,
  windowStart: number,
  windowEnd: number,
  ideal: number,
  lambda: number,
): number {
  const fStart = clampFrame(smooth.length, windowStart / FRAME_SEC)
  const fEnd = clampFrame(smooth.length, windowEnd / FRAME_SEC)
  let bestFrame = fStart
  let bestCost = Number.POSITIVE_INFINITY
  for (let f = fStart; f <= fEnd; f++) {
    const t = (f + 0.5) * FRAME_SEC
    const cost = smooth[f] + lambda * Math.abs(t - ideal)
    if (cost < bestCost) {
      bestCost = cost
      bestFrame = f
    }
  }
  return (bestFrame + 0.5) * FRAME_SEC
}

function clampFrame(length: number, frame: number): number {
  return Math.min(length - 1, Math.max(0, Math.round(frame)))
}

function smoothScores(scores: Float32Array, win: number): Float32Array {
  const n = scores.length
  const out = new Float32Array(n)
  if (n === 0) return out
  const half = Math.floor(win / 2)
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + scores[i]
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(n, i + half + 1)
    out[i] = (prefix[b] - prefix[a]) / (b - a)
  }
  return out
}

function safeExtension(fileName: string): string {
  const ext = getExtension(fileName)
  return /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""
}

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
      if (code === 0) resolve()
      else reject(new Error(`Audio chunk encoding failed. (ffmpeg exit ${code}) ${stderr.slice(0, 300)}`))
    })
  })
}
