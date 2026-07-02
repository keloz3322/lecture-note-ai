import fs from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { put } from "@vercel/blob"

const DEFAULT_SERVER = "http://localhost:3011"

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      args[key] = "true"
    } else {
      args[key] = next
      i++
    }
  }
  return args
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function postJson(server, pathname, payload) {
  const url = new URL(pathname, server)
  const body = Buffer.from(JSON.stringify(payload))
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": body.length },
        timeout: 0,
      },
      (res) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`${pathname} ${res.statusCode}: ${text.slice(0, 800)}`))
            return
          }
          try {
            resolve(JSON.parse(text))
          } catch {
            reject(new Error(`${pathname} returned non-json: ${text.slice(0, 200)}`))
          }
        })
      },
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

async function postMultipart(server, pathname, form) {
  const url = new URL(pathname, server)
  const response = await fetch(url, { method: "POST", body: form })
  const text = await response.text()
  if (!response.ok) throw new Error(`${pathname} ${response.status}: ${text.slice(0, 800)}`)
  return JSON.parse(text)
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true })
    let stderr = ""
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 1000)}`))
    })
  })
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 1000)}`))
    })
  })
}

function log(value) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`)
}

const args = parseArgs(process.argv.slice(2))
if (!args.file || !args.slug) {
  console.error("Usage: node scripts/generate-demo-candidate.mjs --file <path> --slug <slug>")
  process.exit(1)
}

loadEnv(path.resolve(".env.local"))

const server = args.server || DEFAULT_SERVER
const filePath = path.resolve(args.file)
const fileName = path.basename(filePath)
const outDir = path.resolve(args.outDir || path.join("tmp", "demo-generation"))
const transcriptionEngine = args.transcription || "gateway-whisper"
const refineEngine = args.refine || "gateway-gemini"

fs.mkdirSync(outDir, { recursive: true })

const bytes = fs.readFileSync(filePath)
const started = Date.now()

const transcribeStarted = Date.now()
let transcribed
if (args.localChunkSeconds) {
  transcribed = await transcribeLocalChunks({
    server,
    filePath,
    fileName,
    slug: args.slug,
    outDir,
    transcriptionEngine,
    chunkSeconds: Number(args.localChunkSeconds),
  })
} else {
  const blob = await put(`demo-generation/${Date.now()}-${fileName}`, bytes, {
    access: "private",
    contentType: args.contentType || "audio/ogg",
    addRandomSuffix: false,
  })
  log({ stage: "uploaded", slug: args.slug, fileName, size: bytes.length, pathname: blob.pathname })

  transcribed = await postJson(server, "/api/transcribe", {
    pathname: blob.pathname,
    fileName,
    engine: transcriptionEngine,
  })
}
const transcribeMs = Date.now() - transcribeStarted
fs.writeFileSync(path.join(outDir, `${args.slug}.transcribe.json`), JSON.stringify(transcribed, null, 2))
log({
  stage: "transcribed",
  slug: args.slug,
  seconds: Math.round(transcribeMs / 1000),
  chars: transcribed.rawTranscript?.length,
  segments: transcribed.segments?.length,
  timestampStatus: transcribed.timestampStatus,
})

const refineStarted = Date.now()
const refined = await postJson(server, "/api/refine", {
  rawTranscript: transcribed.rawTranscript,
  segments: transcribed.segments,
  words: transcribed.words,
  durationSeconds: transcribed.durationSeconds,
  timestampStatus: transcribed.timestampStatus,
  transcriptionEngineLabel: transcribed.transcriptionEngineLabel,
  engine: refineEngine,
})
const refineMs = Date.now() - refineStarted
log({
  stage: "refined",
  slug: args.slug,
  seconds: Math.round(refineMs / 1000),
  contentType: refined.contentType,
  detectedType: refined.detectedType,
  summaryChars: refined.summary?.length,
  timeline: refined.timeline?.length,
  sections: refined.sections?.map((section) => section.id),
})

const artifact = {
  kind: "file-demo-candidate",
  sourceFile: filePath,
  fileName,
  engine: { transcription: transcriptionEngine, refine: refineEngine },
  timingsMs: { total: Date.now() - started, transcribe: transcribeMs, refine: refineMs },
  transcribed,
  refined,
}
const outPath = path.join(outDir, `${args.slug}.json`)
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2))
log({ stage: "saved", slug: args.slug, outPath })

async function transcribeLocalChunks({ server, filePath, fileName, slug, outDir, transcriptionEngine, chunkSeconds }) {
  const durationText = await capture("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ])
  const durationSeconds = Number.parseFloat(durationText.trim())
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Could not read source duration with ffprobe.")
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "demo-chunks-"))
  const parts = []
  try {
    const totalChunks = Math.ceil(durationSeconds / chunkSeconds)
    log({ stage: "chunk-plan", slug, durationSeconds: Math.round(durationSeconds), chunkSeconds, totalChunks })

    for (let index = 0; index < totalChunks; index++) {
      const start = index * chunkSeconds
      const length = Math.min(chunkSeconds, durationSeconds - start)
      const chunkPath = path.join(tempDir, `chunk-${String(index + 1).padStart(2, "0")}.opus`)
      await run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        start.toFixed(3),
        "-i",
        filePath,
        "-t",
        length.toFixed(3),
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
        chunkPath,
      ])

      const chunkBytes = fs.readFileSync(chunkPath)
      const form = new FormData()
      form.append("engine", transcriptionEngine)
      form.append("file", new File([chunkBytes], path.basename(chunkPath), { type: "audio/ogg" }))
      const chunkStarted = Date.now()
      const result = await postMultipart(server, "/api/transcribe", form)
      parts.push({ result, offset: start })
      fs.writeFileSync(
        path.join(outDir, `${slug}.chunk-${String(index + 1).padStart(2, "0")}.json`),
        JSON.stringify({ offset: start, result }, null, 2),
      )
      log({
        stage: "chunk-transcribed",
        slug,
        index: index + 1,
        totalChunks,
        seconds: Math.round((Date.now() - chunkStarted) / 1000),
        offset: Math.round(start),
        chars: result.rawTranscript?.length,
        segments: result.segments?.length,
        size: chunkBytes.length,
      })
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }

  return mergeTranscripts(parts, durationSeconds)
}

function mergeTranscripts(parts, totalDuration) {
  const rawTranscript = parts
    .map((part) => String(part.result.rawTranscript || "").trim())
    .filter(Boolean)
    .join("\n")
  const segments = []
  const words = []
  let language
  let transcriptionEngineLabel

  for (const { result, offset } of parts) {
    if (!language && result.language) language = result.language
    if (!transcriptionEngineLabel && result.transcriptionEngineLabel) {
      transcriptionEngineLabel = result.transcriptionEngineLabel
    }
    for (const segment of result.segments || []) {
      segments.push({ start: segment.start + offset, end: segment.end + offset, text: segment.text })
    }
    for (const word of result.words || []) {
      words.push({ word: word.word, start: word.start + offset, end: word.end + offset })
    }
  }

  return {
    rawTranscript,
    language,
    durationSeconds: totalDuration,
    segments: segments.length > 0 ? segments : undefined,
    words: words.length > 0 ? words : undefined,
    timestampStatus: segments.length > 0 ? "available" : "unavailable",
    transcriptionEngineLabel,
  }
}
