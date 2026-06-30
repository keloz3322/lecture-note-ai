import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import ffmpegPath from "ffmpeg-static"
import * as ort from "onnxruntime-node"
import { getExtension } from "@/lib/format"

// Silero VAD v5 runs on 16kHz mono audio in fixed 512-sample frames (32ms).
const SAMPLE_RATE = 16000
const FRAME_SAMPLES = 512
const FRAME_BYTES = FRAME_SAMPLES * 4 // f32le
const FRAME_SEC = FRAME_SAMPLES / SAMPLE_RATE // 0.032s

export interface AudioChunk {
  index: number
  startSec: number
  endSec: number
}

// Cache the ONNX session across invocations on a warm function.
let sessionPromise: Promise<ort.InferenceSession> | null = null

function resolveModelPath(): string {
  const candidates = [
    join(process.cwd(), "models", "silero_vad.onnx"),
    join(process.cwd(), ".next", "server", "models", "silero_vad.onnx"),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(resolveModelPath()).catch((err) => {
      sessionPromise = null
      throw err
    })
  }
  return sessionPromise
}

/** Write the original media to a temp file once; reuse for probe/VAD/extract. */
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
 * Decode the media to 16kHz mono PCM and run Silero VAD frame-by-frame, returning
 * the raw speech-probability score (0..1) per 32ms frame. We deliberately keep the
 * model's raw scores (no binarize threshold) so the chunker can locate the deepest
 * silence valleys rather than just speech/non-speech regions. The PCM is streamed
 * with backpressure so we never hold the whole decoded waveform in memory.
 */
export async function computeVadScores(inputPath: string): Promise<Float32Array> {
  if (!ffmpegPath) throw new Error("오디오 디코딩 도구(ffmpeg)를 찾을 수 없습니다.")
  const session = await getSession()

  const scores: number[] = []
  let stateData = new Float32Array(2 * 1 * 128)
  const srTensor = new ort.Tensor("int64", BigInt64Array.from([BigInt(SAMPLE_RATE)]), [])

  const proc = spawn(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(SAMPLE_RATE),
    "-f",
    "f32le",
    "-",
  ])

  return new Promise<Float32Array>((resolve, reject) => {
    let leftover = Buffer.alloc(0)
    let chain: Promise<void> = Promise.resolve()
    let stderr = ""
    let failed = false

    const fail = (err: Error) => {
      if (failed) return
      failed = true
      proc.kill("SIGKILL")
      reject(err)
    }

    proc.stdout.on("data", (chunk: Buffer) => {
      if (failed) return
      proc.stdout.pause()
      const buf = Buffer.concat([leftover, chunk])
      const frameCount = Math.floor(buf.length / FRAME_BYTES)
      const usableBytes = frameCount * FRAME_BYTES
      // Copy into a fresh, 4-byte-aligned ArrayBuffer so we can view it as floats.
      const aligned = buf.buffer.slice(buf.byteOffset, buf.byteOffset + usableBytes)
      const samples = new Float32Array(aligned)
      leftover = Buffer.from(buf.subarray(usableBytes))

      chain = chain
        .then(async () => {
          for (let i = 0; i < frameCount; i++) {
            const frame = samples.subarray(i * FRAME_SAMPLES, (i + 1) * FRAME_SAMPLES)
            const out = await session.run({
              input: new ort.Tensor("float32", frame, [1, FRAME_SAMPLES]),
              state: new ort.Tensor("float32", stateData, [2, 1, 128]),
              sr: srTensor,
            })
            scores.push(Number((out.output.data as Float32Array)[0]))
            // Copy into a fresh array so we don't retain ONNX-managed memory.
            stateData = Float32Array.from(out.stateN.data as ArrayLike<number>)
          }
        })
        .then(() => {
          if (!failed) proc.stdout.resume()
        })
        .catch((err) => fail(err instanceof Error ? err : new Error(String(err))))
    })

    proc.stderr.on("data", (c) => {
      stderr += c.toString()
    })
    proc.on("error", (err) => fail(err))
    proc.on("close", (code) => {
      chain
        .then(() => {
          if (failed) return
          if (code !== 0) {
            fail(new Error(`오디오 디코딩에 실패했습니다. (ffmpeg exit ${code}) ${stderr.slice(0, 300)}`))
            return
          }
          resolve(Float32Array.from(scores))
        })
        .catch((err) => fail(err instanceof Error ? err : new Error(String(err))))
    })
  })
}

/**
 * Plan chunk boundaries from raw VAD scores. Each chunk targets `targetSeconds`
 * and never exceeds `maxSeconds`. The cut is placed at the deepest silence valley
 * within a search window around the target, falling back to the relatively
 * quietest point when the audio is continuous speech (so we still cut sensibly).
 */
export function planChunks(
  scores: Float32Array,
  totalDuration: number,
  targetSeconds: number,
  maxSeconds: number,
): AudioChunk[] {
  const chunks: AudioChunk[] = []
  if (totalDuration <= 0) return chunks

  // Smooth over ~160ms (5 frames) so a single dip mid-word doesn't win over a
  // sustained pause between sentences.
  const smooth = smoothScores(scores, 5)
  const SEARCH_RADIUS = 20 // seconds to look on each side of the target cut
  const TIE_LAMBDA = 0.02 // per-second penalty so ties break toward the target

  let start = 0
  let index = 0
  // Guard against pathological loops on near-silent or malformed score arrays.
  while (start < totalDuration - 0.05 && index < 10000) {
    const remaining = totalDuration - start
    if (remaining <= maxSeconds) {
      chunks.push({ index: index++, startSec: start, endSec: totalDuration })
      break
    }

    const ideal = start + targetSeconds
    const windowStart = Math.max(start + targetSeconds - SEARCH_RADIUS, start + 1)
    const windowEnd = Math.min(start + maxSeconds, totalDuration, ideal + SEARCH_RADIUS)
    const cut = findValley(smooth, windowStart, windowEnd, ideal, TIE_LAMBDA)
    // Safety: ensure forward progress.
    const safeCut = cut > start + 0.5 ? cut : Math.min(start + maxSeconds, totalDuration)
    chunks.push({ index: index++, startSec: start, endSec: safeCut })
    start = safeCut
  }

  return chunks
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

/** Extract a [startSec, endSec) slice of the input and encode it to Opus (16kHz mono 32kbps). */
export async function extractChunkOpus(inputPath: string, startSec: number, endSec: number): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("오디오 인코딩 도구(ffmpeg)를 찾을 수 없습니다.")
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
      String(SAMPLE_RATE),
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

function safeExtension(fileName: string): string {
  const ext = getExtension(fileName)
  return /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""
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
      else reject(new Error(`오디오 분할 인코딩에 실패했습니다. (ffmpeg exit ${code}) ${stderr.slice(0, 300)}`))
    })
  })
}
