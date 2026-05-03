# Framesmith

**Drop a photo. Describe a scene. Get a cinematic video.**

Framesmith turns a single reference image into a sequence of photorealistic video scenes — preserving your subject's identity across every shot. Built for filmmakers, writers, and creators who want to visualize stories without a film crew.

---

## How it works

1. **Drop a photo** — any image of a person, location, or object
2. **Describe your scene** — fill in location, weather/lighting, action, and any extra detail
3. **Preview instantly** — a photorealistic keyframe appears in ~15s
4. **Approve for video** — a full cinematic clip renders in ~60s
5. **Chain scenes** — build a complete film strip, one shot at a time

Character identity is preserved across every scene using Flux Kontext for keyframe generation and Seedance Pro for video synthesis.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| API | tRPC |
| Background jobs | Inngest |
| Database | Prisma + Neon (Postgres) |
| Cache | Upstash Redis |
| AI inference | fal.ai (Flux Kontext Max, Seedance v1 Pro, Chatterbox) |
| Hosting | Vercel |

---

## Self-hosting

### 1. Clone and install

```bash
git clone https://github.com/your-username/framesmith
cd framesmith
npm install
```

### 2. Set up services

You'll need free accounts on:

- [fal.ai](https://fal.ai) — AI inference (Flux, Seedance, Chatterbox)
- [Neon](https://neon.tech) — Postgres database
- [Upstash](https://upstash.com) — Redis
- [Inngest](https://inngest.com) — background job orchestration

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```env
FAL_KEY=your_fal_api_key

NEXT_PUBLIC_APP_URL=http://localhost:3000

DATABASE_URL=your_neon_connection_string

KV_REST_API_URL=your_upstash_url
KV_REST_API_TOKEN=your_upstash_token

INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

### 4. Initialize database

```bash
npx prisma db push
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> For background jobs to work locally, run the Inngest dev server in a separate terminal:
> ```bash
> npx inngest-cli@latest dev
> ```

---

## Deploy to Vercel

```bash
npx vercel
```

Add all environment variables in the Vercel dashboard, then register your Inngest webhook:

```
https://your-app.vercel.app/api/inngest
```

---

## Features

- **Two-stage pipeline** — fast keyframe preview before committing to a full video render
- **Character consistency** — Flux Kontext anchors identity from your reference photo; no facial drift across scenes
- **Voice synthesis** — optional dialogue-to-speech via Chatterbox, synced to the generated clip
- **Scene composer** — structured fields (location, weather, action, additional) build precise generation prompts
- **Project library** — all your projects and scenes persist across sessions
- **Share links** — shareable read-only view of any project

---

## Architecture

```
User uploads photo
       │
       ▼
  Flux Kontext Max          ←── character ref + scene description
  (keyframe, ~15s)
       │
       ▼
  Seedance v1 Pro           ←── keyframe + motion prompt
  (video, ~60s)
       │
       ▼
  Persisted to Postgres
  Delivered via tRPC poll
```

Background jobs run on Inngest — each scene generation is a durable, resumable workflow that survives server restarts and network blips.

---

## License

MIT
