# v0 Max One-Shot Prompt

You are working on the existing `transcript-studio` Next.js app in this GitHub-connected v0 session.

Before editing, read:

- `docs/uiux-handoff/UIUX_Agent_Brief.md`
- the current app files under `app/`, `components/`, `lib/`, and `hooks/`

Goal: dramatically improve the UI/UX quality of the current Transcript Studio product using the handoff as reference, while preserving the working product behavior.

Important product reality:

- This is already a functioning app, not a blank prototype.
- It has two primary modes:
  - `실시간 번역·전사`
  - `파일 분석`
- It supports live microphone translation/transcription, file upload analysis, demo playback, transcript/note results, model selectors, download/export controls, and Vercel-backed API routes.
- Preserve API routes and backend behavior unless a small UI-facing contract change is truly necessary.
- Do not remove the existing demo modes, recording download behavior, file analysis flow, live translation flow, or model selection behavior.
- Do not paste or expose secrets. Do not add API keys.

Design direction:

- Raise the app from a functional tool to a polished desktop-first AI document workspace.
- Use the handoff references for structure: Notion-like document workspace, Otter-like timestamped transcript review, summary-first AI notes, and editable/reviewable AI output.
- Keep the first screen as the working product UI, not a marketing landing page.
- Prefer a calm, dense, readable SaaS interface over a decorative hero page.
- Avoid large gradients, decorative blobs, purple-heavy AI styling, and generic dashboard cards.
- Keep the interface professional enough for a bootcamp design guide submission.

Target UX structure:

- Use a stronger app shell with a compact header and clear product identity.
- Keep the two main tabs, but make `실시간 번역·전사` feel like the primary workspace and `파일 분석` like a parallel workflow.
- Improve the live translation layout:
  - clear control panel,
  - visible recording/session state,
  - source and translated transcript lanes,
  - auto-scroll affordance,
  - note-generation controls near the output they affect,
  - large readable note result area.
- Improve the file analysis layout:
  - upload/record/import mental model where appropriate,
  - clearer processing steps,
  - stronger result editor with Summary, Transcript, Translation/Notes style separation,
  - sticky or highly visible media/progress controls where relevant.
- Improve result readability:
  - summary first,
  - key points,
  - action/study items only when the selected note format warrants it,
  - timestamps and transcript rows when timestamps exist,
  - disabled/empty timeline state when timestamps are unavailable.
- Improve empty, loading, processing, error, and demo states so the app never feels frozen.
- Keep mobile responsive, but optimize for desktop first.

Component and implementation constraints:

- Use the existing Next.js App Router, TypeScript, Tailwind, and lucide-react patterns.
- Prefer editing existing components rather than inventing a parallel app.
- Do not add heavy new dependencies.
- Do not build fake navigation pages that replace the actual app. If you add workspace-like structure, it should wrap or clarify the current flows.
- Avoid nested cards and unstable layout shifts.
- Use icons for recognizable actions.
- Keep button dimensions stable.
- Keep text readable and avoid overflow on mobile and desktop.
- Do not change model IDs, env var names, API paths, upload limits, live API contracts, or transcript metadata handling unless absolutely necessary.

Files likely relevant:

- `components/note-app.tsx`
- `components/live-translate-panel.tsx`
- `components/upload-panel.tsx`
- `components/results-panel.tsx`
- `components/progress-steps.tsx`
- `components/engine-selector.tsx`
- `components/copy-button.tsx`
- `app/globals.css`
- `app/layout.tsx`

Please do this as one coherent UI/UX pass:

1. Inspect the current app structure and understand existing state/props before editing.
2. Redesign the shell, layout hierarchy, visual system, and key states.
3. Preserve all core product flows.
4. Keep the current Korean product copy where it is accurate, but improve labels when clearer.
5. Verify the app compiles.
6. Run the available local checks, at minimum TypeScript and build if possible.
7. Commit your changes to a v0 branch with a clear commit message.

Acceptance checklist:

- The app still opens directly into the product UI.
- `실시간 번역·전사` remains the first/default mode.
- `파일 분석` remains available and usable.
- Live translation has a clearer workspace layout and no cramped three-column feel.
- File analysis has clearer upload, processing, demo, and result states.
- Result notes feel like an editable/reviewable AI document, not a static block of text.
- Timestamped transcripts are visibly structured.
- No API key or secret is added to code.
- No current backend pipeline is broken.
- TypeScript/build checks pass.
