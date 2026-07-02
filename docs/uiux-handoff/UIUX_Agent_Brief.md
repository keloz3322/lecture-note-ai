# Transcript Studio UIUX Agent Brief

## Goal

Build a high-fidelity web app prototype for **Transcript Studio**, a productivity tool that turns lecture, meeting, and video/audio content into editable transcripts, summaries, translations, and study notes.

This is not a marketing landing page. The first screen must be the working product interface.

## Product Positioning

- Product name: Transcript Studio
- Audience: students, bootcamp learners, office workers, creators, researchers
- Core promise: "Turn long audio and video into review-ready knowledge"
- UX tone: focused, efficient, readable, calm, precise
- Primary device: desktop web first, responsive tablet/mobile secondary
- Product category: AI document workspace + media transcript editor

## Reference Assets

Use these references as structural and interaction inspiration. The original image files are intentionally not committed to this public repository; follow the linked sources and the mapping below instead.

| Asset | Source |
| --- | --- |
| AI note summary app | https://www.behance.net/gallery/233378667/AI-Note-Taker-Mobile-App-UIUX |
| Notion AI meeting notes | https://mobbin.com/explore/web/flows/recording-audio-video |
| Otter AI transcript screen | https://mobbin.com/explore/mobile/screens/audio-video-recorder |
| AI transcription result concept | https://www.behance.net/gallery/224337933/UIUX-for-an-AI-powered-handwriting-transcription-app |

## Reference Mapping

### Behance - AI Note Taker

Borrow:
- AI-generated notes as a clear, readable result
- Summary-first information hierarchy
- Smart assistant feel without overwhelming the user
- Compact note cards and task-like result blocks

Apply to Transcript Studio:
- Results view should start with AI summary and key points before the full transcript
- Use cards for summary, keywords, action items, and study questions

### Mobbin - Notion AI Meeting Notes

Borrow:
- Web document workflow
- AI note creation inside a document-like workspace
- Recording and AI summary as part of the same flow

Apply to Transcript Studio:
- New project flow should offer upload, direct recording, and URL import
- AI processing should lead into a document editor, not a separate static report

### Mobbin - Otter AI Transcript

Borrow:
- `Summary / Transcript / Chat / Comments` style tab separation
- Timestamped transcript chunks
- Audio playback controls anchored to the result
- Speaker/time metadata near the transcript

Apply to Transcript Studio:
- Transcript view must sync audio playback with transcript text
- Use a sticky media player and timestamped transcript rows

### Behance - AI-powered Transcription App

Borrow:
- Input-to-text transformation flow
- AI result review and cleanup
- Text-centric result screen

Apply to Transcript Studio:
- AI outputs must be editable and reviewable
- Include confidence, correction, export, and version states

## Information Architecture

Use this app structure:

- `Workspace`
  - Recent projects
  - Quick create
  - Processing queue
  - Saved templates

- `New Project`
  - Upload audio/video
  - Record now
  - Import from URL
  - Language and output options

- `Processing`
  - File metadata
  - Progress states
  - AI steps: uploading, transcribing, summarizing, translating

- `Project Result`
  - Summary
  - Transcript
  - Translation
  - Study Notes
  - Q&A / AI Chat
  - Export

- `Library`
  - Project list
  - Search
  - Tags
  - Filters

## Required Screens

### 1. Workspace Dashboard

Must include:
- Sidebar navigation: `Workspace`, `Library`, `Templates`, `Exports`, `Settings`
- Header with search and `New project` button
- Quick create panel with three options:
  - `Upload file`
  - `Record now`
  - `Import URL`
- Recent projects table or list with:
  - title
  - source type
  - duration
  - language
  - status
  - last edited
- Processing queue card with progress
- Example projects:
  - `React Hooks Lecture`
  - `Product Weekly Sync`
  - `YouTube: Busan Travel Interview`

Design direction:
- Desktop SaaS workspace
- Dense but organized
- Avoid oversized hero or decorative marketing blocks

### 2. New Project Flow

Must include:
- Modal or right panel
- Upload dropzone
- Record now option with microphone state
- URL input option
- Source language selector
- Output options:
  - transcript
  - summary
  - translation
  - study notes
  - quiz questions
- CTA: `Start transcription`

### 3. Processing State

Must include:
- File name, duration, size
- Stepper:
  - Uploading
  - Transcribing
  - Detecting speakers
  - Summarizing
  - Translating
- Estimated time remaining
- Cancel and notify options
- Friendly but concise status copy

### 4. Project Result Editor

Must include:
- Two or three-column layout:
  - left: project navigation / sections
  - center: active document content
  - right: AI tools or metadata panel
- Tabs:
  - `Summary`
  - `Transcript`
  - `Translation`
  - `Study Notes`
  - `AI Chat`
- Sticky audio/video player at bottom or top of content
- Export button

### 5. Summary Tab

Must include:
- Overview paragraph
- Key points
- Action items or study tasks
- Keywords
- Suggested title
- AI confidence or review-needed indicator

### 6. Transcript Tab

Must include:
- Speaker labels
- Timestamped transcript rows
- Active row highlight while audio plays
- Inline edit affordance
- Search within transcript
- Confidence or unclear segment marker
- Sticky player with:
  - play/pause
  - timeline
  - current time
  - speed selector
  - skip back/forward

### 7. Translation Tab

Must include:
- Source and target language controls
- Side-by-side source/translated text or segmented rows
- Copy/export controls
- Notice that translation follows edited transcript when changed

### 8. Study Notes Tab

Must include:
- Auto-generated outline
- Flashcard-like Q&A cards
- Quiz questions
- Important terms
- Save to study set button

### 9. AI Chat Panel

Must include:
- Prompt chips:
  - `Summarize simpler`
  - `Find action items`
  - `Make quiz`
  - `Explain this segment`
- Chat input
- Responses linked to transcript timestamps

## Component Rules

- Use a proper app shell with sidebar on desktop.
- Use tabs for result categories.
- Use a fixed or sticky media player.
- Use tables/lists for project library.
- Use badges for status: `Ready`, `Processing`, `Needs review`, `Exported`.
- Use icons for upload, record, URL import, export, play/pause, search.
- Use cards for AI-generated summary blocks, not for every section wrapper.
- Avoid nested cards.
- Buttons must have stable dimensions and no overflow.

## Visual System

Suggested palette:
- Primary: `#2563EB` clear productivity blue
- Accent: `#14B8A6` teal for AI/ready states
- Warm accent: `#F59E0B` for review-needed states
- Danger: `#DC2626`
- Background: `#F8FAFC`
- Surface: `#FFFFFF`
- Surface subtle: `#F1F5F9`
- Text primary: `#111827`
- Text secondary: `#64748B`
- Border: `#D8E0EA`

Use this palette with restraint. The interface should not become a one-color blue/slate dashboard. Use neutral surfaces and small accents.

Typography:
- Use a clear sans-serif optimized for reading.
- Transcript text should be comfortable for long reading.
- Summary cards can be slightly denser but must remain scannable.

Layout:
- Desktop target: 1440px wide app shell.
- Sidebar: 240px.
- Main content: flexible.
- Right panel: 320px when present.
- Mobile: collapse sidebar into bottom or top navigation, keep tabs horizontal scroll.

## Interaction Requirements

Prototype should support these interactions at minimum:
- `New project` opens modal/panel
- Upload/record/import options switch selected state
- `Start transcription` moves to processing state
- Processing can complete into result editor
- Tabs switch visible content
- Transcript row click updates the active timestamp/player state
- AI prompt chips add visible example responses
- Export button opens export options

## Mock Data Requirements

Use realistic content:
- Lecture: `React Hooks Lecture`
- Meeting: `Product Weekly Sync`
- Video: `Busan Travel Interview`
- Languages: English, Korean, Japanese
- Durations: 12:44, 48:12, 01:12:05
- Transcript rows with speaker labels and timestamps
- Do not use lorem ipsum or placeholder transcript text

Example transcript content:
- `00:26 Speaker 1: Today we are going to compare controlled and uncontrolled components in React.`
- `01:12 Speaker 2: Can you explain how useEffect cleanup works when the component unmounts?`
- `02:08 Speaker 1: The important point is that the cleanup function runs before the effect runs again.`

## Do Not

- Do not create a marketing landing page.
- Do not make the product look like only an audio player.
- Do not show a transcript as one huge paragraph.
- Do not hide audio controls away from the transcript.
- Do not make AI output look final and uneditable.
- Do not use generic empty dashboards with placeholder cards.
- Do not overuse purple gradients or dark blue/slate backgrounds.
- Do not use decorative blobs or abstract AI ornaments.

## Acceptance Checklist

- First screen is an app workspace dashboard.
- New project flow supports upload, recording, and URL import.
- Processing state shows AI steps.
- Result editor has Summary, Transcript, Translation, Study Notes, and AI Chat sections.
- Transcript uses timestamps, speaker labels, active row, and sticky media controls.
- Summary is clearly separated from full transcript.
- AI output is editable/reviewable, not final static text.
- Mock data is realistic and service-specific.
- Layout works on desktop and collapses coherently on mobile.

## Copy-Paste Prompt

Use this prompt in v0 or another UI generation agent:

```text
Build a high-fidelity desktop-first web app prototype for Transcript Studio, an AI workspace that turns lecture, meeting, video, and audio content into editable transcripts, summaries, translations, and study notes.

This must be an actual working product UI, not a marketing landing page. The first screen should be the app workspace dashboard.

Use these references:
- AI Note Taker Behance: summary-first AI note UI, compact result cards, smart assistant feel.
- Notion AI Meeting Notes via Mobbin: web document workflow, recording inside a workspace, AI summary and transcript results.
- Otter AI via Mobbin: Summary / Transcript / Chat / Comments tabs, timestamped transcript, sticky audio controls.
- AI transcription Behance project: input-to-text transformation, editable AI result review flow.

Required app sections:
- Workspace dashboard
- New Project flow
- Processing state
- Project Result editor
- Library

Required visible screens/states:
1. Workspace dashboard with sidebar, search, New project button, quick create options (Upload file, Record now, Import URL), recent projects, and processing queue.
2. New Project modal or side panel with upload dropzone, recording option, URL input, language selector, and output options.
3. Processing state with steps: Uploading, Transcribing, Detecting speakers, Summarizing, Translating.
4. Project Result editor with tabs: Summary, Transcript, Translation, Study Notes, AI Chat.
5. Summary tab with overview, key points, action items/study tasks, keywords, confidence/review indicator.
6. Transcript tab with speaker labels, timestamps, active row highlight, inline edit affordance, transcript search, sticky audio player, playback speed, skip controls.
7. Translation tab with source/target controls and segmented translation rows.
8. Study Notes tab with outline, Q&A cards, quiz questions, important terms.
9. AI Chat panel with prompt chips linked to transcript timestamps.

Use realistic mock data:
- React Hooks Lecture
- Product Weekly Sync
- YouTube: Busan Travel Interview
- English/Korean/Japanese language examples
- Transcript rows with real timestamps and speaker labels

Style:
- Focused productivity SaaS interface.
- Desktop app shell with 240px sidebar, main document area, optional 320px AI tools panel.
- Balanced palette: productivity blue (#2563EB), AI teal (#14B8A6), warning amber (#F59E0B), neutral white/gray surfaces.
- Use tabs, badges, tables/lists, sticky player, and clear icons.
- Avoid landing-page hero sections, decorative AI gradients, generic placeholder cards, one-color dark slate dashboard, and huge unstructured transcript paragraphs.

Prototype interactions:
- New project opens panel.
- Source type selection changes state.
- Start transcription moves to processing, then result editor.
- Tabs switch content.
- Transcript row click changes active timestamp/player state.
- AI prompt chips produce example responses.
- Export opens export menu.

Make the UI polished enough for a bootcamp design guide submission and precise enough that a developer could implement from it.
```
