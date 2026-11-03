# Fileforge

A browser-based workspace for **converting, previewing, editing and organising files**, with no accounts and no login. Built with Next.js (App Router) and deployable to Vercel as a single project.

The UI follows the FoneInvest design tokens (brand `#006DFF`, slate neutrals, Inter, 12–20 px radii) with light and dark themes.

## What it does

| Area | Details |
| --- | --- |
| **Convert** | Drop one or many files, pick a conversion, review the result (name, size, preview, download) and save it to a group. Progress, cancel and readable errors for every job. |
| **Preview & edit** | PDF (rotate, reorder, delete pages, zoom), images (rotate, flip, crop, resize, format/quality), Lottie (play, scrub, live JSON editor, export frame), Markdown/HTML/CSV/TXT/JSON (preview and edit source), DOCX (preview), ZIP (listing), video/audio. |
| **Library** | Groups (create, rename, delete), file rename, move, search, type filter, sort, multi-select, bulk download (ZIP), bulk move, bulk delete, convert again. Shows type, size, conversion date and group. |
| **Storage** | Anonymous workspace token stored in the browser. Files in private Vercel Blob when configured, otherwise browser-only IndexedDB. |

## Supported conversions

Everything marked **Browser** runs entirely on the user's device (no upload, no serverless limits).

| Conversion | Runs in | Notes |
| --- | --- | --- |
| Image → PNG / JPG / WebP | Browser | PNG, JPG, WebP, GIF (first frame), BMP, AVIF, SVG in. WebP out needs browser support (detected). HEIC is **not** supported. |
| Images → PDF | Browser | One PDF, or one per image. Match image size or A4. |
| PDF → PNG / JPG | Browser | Page range, 1x–3x resolution, up to 300 pages. Password-protected PDFs are rejected with a clear message. |
| Merge PDFs · Split PDF | Browser | `pdf-lib`. |
| DOCX / Markdown / HTML / CSV / TXT → PDF | Browser | Rendered to A4 pages. Tables, lists, headings and images are kept; **text in the PDF is an image (not selectable)** and complex Word layout (headers/footers, text boxes) is simplified. Any script, including Devanagari, renders. |
| Markdown → HTML | Browser | Headings, lists, links, code, quotes, emphasis. No Markdown tables. |
| JSON ↔ CSV | Browser | JSON must be an array of objects. |
| Lottie → PNG (frame) · PNG sequence (ZIP) · WebM · `.lottie` → JSON | Browser | WebM is recorded in real time with `MediaRecorder` (Chrome, Edge, Firefox) and hidden with an explanation where unsupported. **Animated GIF export is not offered.** |
| PPTX / XLSX / DOC / XLS / PPT / ODT / ODS / ODP / RTF → PDF | **External provider** | Shown but locked until a provider is configured (see below). Cannot be done reliably in a browser or a serverless function. |

A conversion is only offered when it matches **all** selected files, and locked ones always say why.

## Architecture

```
app/                    Next.js App Router
  page.tsx              single-page client app
  api/
    config              public limits + feature flags (no secrets)
    blob/upload         issues path-scoped client-upload tokens for Vercel Blob
    library             workspace metadata: list / commit file / rename / move / delete / groups
    files/[id]          streams a private blob to its owner
    convert/external    replaceable adapter to an external conversion service
    cron/purge          daily retention clean-up (protected by CRON_SECRET)
components/             Convert view, Library view, Studio (previewers/editors), UI primitives
lib/
  converters/           one module per family; each exports plain `Converter` objects
  storage/              StorageDriver interface + cloud (Vercel Blob) and local (IndexedDB) drivers
  server/               config, workspace-token auth, metadata store
```

**Adding a conversion:** create a `Converter` (id, accepts, options, run) in `lib/converters/*` and add it to the list in `lib/converters/index.ts`. The UI picks it up automatically.
**Adding a storage backend:** implement `StorageDriver` (`lib/storage/types.ts`) and select it in `lib/store.tsx`.

### How storage works (no accounts)

1. On first visit the browser generates a random 256-bit **workspace token** and keeps it in `localStorage`. It is never shown or sent anywhere except as the `x-workspace-token` header to this app's own API.
2. The server derives an opaque workspace id with SHA-256 and uses it as the storage prefix: `ws/<id>/meta.json` and `ws/<id>/files/<fileId>`. All routes validate that paths belong to the caller's workspace.
3. Files go **directly from the browser to Vercel Blob** using short-lived client tokens (this avoids the 4.5 MB serverless body limit). The Blob read/write token stays on the server.
4. Blobs are **private**. Downloads stream through `/api/files/[id]`, which checks the workspace token.
5. Without `BLOB_READ_WRITE_TOKEN`, the app automatically uses **browser-only storage** (IndexedDB). The UI says so, and that files are device-bound and can be cleared by the browser.

**What users are told:** files are removed `RETENTION_DAYS` (default 30) after they were saved, anyone with that browser profile can reach them, and clearing browser data loses access. Nothing is described as permanent.

**Security model & honest limits.** The workspace token is a bearer secret: whoever has it can read that workspace. There is no recovery if it is lost. Metadata is a single JSON blob per workspace updated read-modify-write, so two tabs saving at the same instant could overwrite each other's change (acceptable for anonymous single-user use; move metadata to a database such as Upstash/Neon if you need stronger guarantees). There is no per-IP rate limiting. Add Vercel's firewall / rate limiting for public deployments.

### Vercel limits that shaped the design

- **Request/response bodies are limited to 4.5 MB** on functions, so uploads use client-direct Blob uploads and conversions run in the browser.
- **Function time and memory are limited** (the external route sets `maxDuration = 60`). Heavy work is not done in functions.
- **No persistent filesystem**, so nothing is written to disk.
- **Large jobs:** images over 16 384 px per side / 100 MP, PDFs over 300 pages, documents over 100 rendered pages, and Lottie over 4096 px or 600 frames are rejected with an explanation instead of crashing the tab.

## Setup

Requirements: Node.js 20+ (tested on 22).

```bash
npm install
npm run dev          # http://localhost:3000
```

With no environment variables the app runs fully in **browser-only mode**. Everything except the external-provider conversions works.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | For durable storage | Injected by Vercel when a Blob store is connected. Locally, copy it from the Vercel dashboard. |
| `CRON_SECRET` | For retention clean-up | Random string. Vercel sends it as `Authorization: Bearer …` to `/api/cron/purge`. |
| `MAX_FILE_MB` | No (100) | Per-file size limit (client and server enforced). |
| `MAX_WORKSPACE_MB` | No (500) | Storage quota per anonymous workspace. |
| `RETENTION_DAYS` | No (30) | Days a saved file is kept. Shown to users. |
| `CONVERT_API_URL` | For external conversions | Endpoint of your conversion provider (see contract). Also requires `BLOB_READ_WRITE_TOKEN`. |
| `CONVERT_API_KEY` | If the provider needs it | Sent as `Authorization: Bearer <key>`. |
| `CONVERT_API_LABEL` | No | Name shown in the UI. |
| `CONVERT_API_FORMATS` | No | Comma-separated input extensions the provider handles (default `docx,doc,xlsx,xls,pptx,ppt,odt,ods,odp,rtf`). |

See `.env.example`. **Never commit `.env*` files.** Secrets are only read in server routes.

### External provider contract

`POST CONVERT_API_URL` with `multipart/form-data` fields `file` (binary), `target` (e.g. `pdf`) and `filename`. Respond `200` with the converted bytes as the body. Any service can be wrapped to fit this (Gotenberg, a self-hosted LibreOffice service, or a small proxy in front of a commercial API). To adapt a provider with a different shape, edit only `callProvider()` in `app/api/convert/external/route.ts`. The browser uploads the source to a private temporary blob first, the route streams it to the provider, and the temporary blob is deleted afterwards. **Not verified against a live provider in this repository.**

## Deploy to Vercel

1. Push the project to a Git repository and **Import** it in Vercel (framework preset: Next.js, no build overrides).
2. **Storage → Create → Blob**, choose **Private** access, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. Add `CRON_SECRET` (any long random string) and optionally the variables above.
4. Deploy. `vercel.json` already schedules the daily retention job (`0 3 * * *`).
5. Visit `/api/config` to confirm `"cloud": true`.

## Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm run start       # run the production build
npm run lint        # ESLint (next core-web-vitals + TypeScript)
npm run typecheck   # tsc --noEmit
```

## Accessibility

Keyboard-operable dropzone, tabs, dialogs (native `<dialog>` focus trapping, Esc to close), sortable table headers with `aria-sort`, labelled icon buttons, live regions for progress and toasts, visible focus rings and reduced-motion support. Colour tokens are taken from the FoneInvest palette (AA-oriented) but the UI has **not had a formal accessibility audit**; icon buttons are 32–38 px, below the 48 px target recommended by the design system. PDF page reordering works by drag **and** by buttons.

## Known limitations

- Cloud mode is implemented against the Vercel Blob SDK and its authorization paths are tested, but it has **not been exercised against a real Blob store** from this environment. Run through upload → library → download once after deploying.
- Document → PDF output is image-based (not selectable text).
- DOCX is preview-only; Office formats beyond DOCX need the external provider.
- No animated GIF export; WebM export needs a browser with `MediaRecorder`.
- Safari may block rasterising HTML in some versions (the converter reports this clearly).
- Private windows and browser privacy settings can clear site data, which loses access to an anonymous workspace.
