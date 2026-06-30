# Transcript Studio Agent Notes

## Project
- Local repo: `C:\Users\keloz\Documents\부트캠프\lecture-note-ai`
- GitHub repo: `keloz3322/lecture-note-ai`
- Vercel team: `2026DEUAI`
- Vercel project: `transcript-studio`
- Production URL: `https://transcript-studio-2026deuai.vercel.app`

## Runtime
- Next.js App Router project.
- Main flow: browser upload -> `/api/transcribe` -> Groq Whisper -> `/api/refine` -> Gemini -> rendered notes.
- Product direction: general-purpose audio/video transcript cleanup and note generation, not lecture-only.
- Audio is not persisted in the current MVP. `NEXT_PUBLIC_ENABLE_BLOB_UPLOAD=false` keeps the direct upload path active.
- Current demo file target is an Ogg Opus mono 16 kHz file below the direct upload limit.

## Secrets
- Do not commit or print API keys.
- Local secrets are in `.env.local`, which is gitignored.
- Required runtime variables:
  - `GROQ_API_KEY`
  - `GEMINI_API_KEY`
  - `GROQ_TRANSCRIPTION_MODEL`
  - `GEMINI_MODEL`
  - `NEXT_PUBLIC_ENABLE_BLOB_UPLOAD`

## Gemini Refinement Notes
- The Gemini refinement API should use `generateContent` with `responseMimeType: "application/json"` and a response schema.
- Keep JSON parsing tolerant: Gemini may still wrap or shape output unexpectedly, so extract the first balanced JSON object before failing.
- If Gemini omits or malforms the timeline, fall back to segment-based timeline buckets so the UI can still render useful notes.
- A previous production issue showed `Gemini가 JSON 형식 결과를 반환하지 못했습니다.` after Groq succeeded. The fix lives in `app/api/refine/route.ts`.

## Verification
- Typecheck: `pnpm exec tsc --noEmit`
- Build: `pnpm build`
- Useful saved test data:
  - `C:\Users\keloz\Documents\부트캠프\lecture-note-ai-test-results\official-transcribe-response-32k.json`
  - `C:\Users\keloz\Documents\부트캠프\lecture-note-ai-test-16k-mono-32k.ogg`
- For production verification, call `https://transcript-studio-2026deuai.vercel.app/api/refine` with the saved transcribe response and confirm repeated `200` responses.
