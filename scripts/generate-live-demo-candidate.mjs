import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { spawn } from "node:child_process"

const DEFAULT_SERVER = "http://localhost:3011"

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) args[key] = "true"
    else {
      args[key] = next
      i++
    }
  }
  return args
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

function log(value) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`)
}

async function parseSocketData(data) {
  if (typeof data === "string") return JSON.parse(data)
  if (data instanceof ArrayBuffer) return JSON.parse(Buffer.from(data).toString("utf8"))
  if (data && typeof data.arrayBuffer === "function") {
    return JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"))
  }
  return JSON.parse(Buffer.from(data).toString("utf8"))
}

function normalizeTranscriptPiece(text) {
  return String(text || "").replace(/\s+/g, " ").trim()
}

function elapsed(startedAt) {
  return Math.round(((Date.now() - startedAt) / 1000) * 10) / 10
}

const args = parseArgs(process.argv.slice(2))
if (!args.file || !args.slug) {
  console.error("Usage: node scripts/generate-live-demo-candidate.mjs --file <path> --slug <slug>")
  process.exit(1)
}

const server = args.server || DEFAULT_SERVER
const targetLanguageCode = args.targetLanguageCode || "ko"
const echoTargetLanguage = args.echoTargetLanguage !== "false"
const filePath = path.resolve(args.file)
const fileName = path.basename(filePath)
const outDir = path.resolve(args.outDir || path.join("tmp", "demo-generation"))
fs.mkdirSync(outDir, { recursive: true })

const tempDir = await mkdtemp(path.join(os.tmpdir(), "live-demo-"))
const pcmPath = path.join(tempDir, "audio.pcm")

try {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    filePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "s16le",
    pcmPath,
  ])

  const pcm = fs.readFileSync(pcmPath)
  log({ stage: "converted", slug: args.slug, fileName, pcmBytes: pcm.length })

  const token = await postJson(server, "/api/live-translate/token", { targetLanguageCode, echoTargetLanguage })
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(
    token.token,
  )}`

  if (typeof WebSocket === "undefined") {
    throw new Error("This Node.js runtime does not provide a global WebSocket implementation.")
  }

  const sourceChunks = []
  const translationChunks = []
  let usageTokens = null
  const startedAt = Date.now()
  const ws = new WebSocket(wsUrl)

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Gemini Live setup timed out.")), 15000)
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${token.model}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              translationConfig: { targetLanguageCode, echoTargetLanguage },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }),
      )
    })
    ws.addEventListener("message", async (event) => {
      const message = await parseSocketData(event.data)
      if (message.setupComplete) {
        clearTimeout(timeout)
        resolve()
      }
    })
    ws.addEventListener("error", reject)
  })

  log({ stage: "connected", slug: args.slug, model: token.model, targetLanguageCode })

  ws.addEventListener("message", async (event) => {
    const message = await parseSocketData(event.data)
    if (message.setupComplete) return
    const content = message.serverContent
    const source = normalizeTranscriptPiece(content?.inputTranscription?.text)
    if (source) {
      sourceChunks.push({
        id: `source-${sourceChunks.length + translationChunks.length + 1}`,
        text: source,
        languageCode: content.inputTranscription.languageCode,
        receivedAtSeconds: elapsed(startedAt),
      })
    }
    const translation = normalizeTranscriptPiece(content?.outputTranscription?.text)
    if (translation) {
      translationChunks.push({
        id: `translation-${sourceChunks.length + translationChunks.length + 1}`,
        text: translation,
        languageCode: content.outputTranscription.languageCode,
        receivedAtSeconds: elapsed(startedAt),
      })
    }
    if (typeof message.usageMetadata?.totalTokenCount === "number") {
      usageTokens = message.usageMetadata.totalTokenCount
    }
  })

  const chunkBytes = 3200
  const realtime = args.realtime !== "false"
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    const chunk = pcm.subarray(offset, Math.min(offset + chunkBytes, pcm.length))
    ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: chunk.toString("base64"),
            mimeType: "audio/pcm;rate=16000",
          },
        },
      }),
    )
    if (realtime) await new Promise((resolve) => setTimeout(resolve, 100))
  }

  ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
  await new Promise((resolve) => setTimeout(resolve, Number(args.flushMs || 6000)))
  ws.close(1000, "demo complete")

  const rawTranscript = translationChunks.map((chunk) => chunk.text).join(" ").trim()
  const segments = translationChunks.map((chunk, index) => ({
    start: chunk.receivedAtSeconds,
    end: translationChunks[index + 1]?.receivedAtSeconds ?? chunk.receivedAtSeconds + 2,
    text: chunk.text,
  }))
  const refineStarted = Date.now()
  const result = await postJson(server, "/api/refine", {
    rawTranscript,
    segments,
    words: [],
    durationSeconds: segments.at(-1)?.end,
    timestampStatus: "estimated",
    transcriptionEngineLabel: "Gemini 3.5 Live Translate",
    engine: args.refine || "gateway-gemini",
  })
  log({
    stage: "refined",
    slug: args.slug,
    seconds: Math.round((Date.now() - refineStarted) / 1000),
    contentType: result.contentType,
    detectedType: result.detectedType,
    sourceChunks: sourceChunks.length,
    translationChunks: translationChunks.length,
  })

  const artifact = {
    title: "Short live translation demo",
    description: "Actual Gemini Live Translate response generated from the selected 19-second audio sample.",
    session: {
      generatedAt: new Date().toISOString(),
      model: token.model,
      targetLanguageCode,
      echoTargetLanguage,
      sourceAudio: { originalFile: fileName },
      usageTokens,
      sourceChunks,
      translationChunks,
    },
    result,
  }
  const outPath = path.join(outDir, `${args.slug}.json`)
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2))
  log({ stage: "saved", slug: args.slug, outPath })
} finally {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {})
}
