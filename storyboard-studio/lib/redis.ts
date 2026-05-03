import { Redis } from "@upstash/redis";
import crypto from "crypto";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export interface JobState {
  sceneId: string;
  fluxRequestId?: string;
  klingRequestId?: string;
  step: "uploading" | "uprendering" | "generating_video" | "complete" | "failed";
  error?: string;
  startedAt: number;
  heartbeatAt: number;
}

const JOB_STATE_PREFIX = "job:scene:";
const JOB_STATE_TTL = 60 * 60; // 1 hour

export async function setJobState(
  sceneId: string,
  state: JobState
): Promise<void> {
  await redis.set(`${JOB_STATE_PREFIX}${sceneId}`, JSON.stringify(state), {
    ex: JOB_STATE_TTL,
  });
}

export async function getJobState(
  sceneId: string
): Promise<JobState | null> {
  const raw = await redis.get<string>(`${JOB_STATE_PREFIX}${sceneId}`);
  if (!raw) return null;
  if (typeof raw === "object") return raw as unknown as JobState;
  return JSON.parse(raw) as JobState;
}

export async function deleteJobState(sceneId: string): Promise<void> {
  await redis.del(`${JOB_STATE_PREFIX}${sceneId}`);
}

// ---------------------------------------------------------------------------
// Character reel cache — keyed by projectId
// TTL: 7 days (604800 seconds)
// This avoids regenerating the reel on every scene submission
// ---------------------------------------------------------------------------

const CHARACTER_REEL_PREFIX = "character-reel:";
const CHARACTER_REEL_TTL = 604800; // 7 days

export async function setCharacterReelCache(
  projectId: string,
  reelUrl: string
): Promise<void> {
  await redis.set(
    `${CHARACTER_REEL_PREFIX}${projectId}`,
    reelUrl,
    { ex: CHARACTER_REEL_TTL }
  );
}

export async function getCharacterReelCache(
  projectId: string
): Promise<string | null> {
  const raw = await redis.get<string>(`${CHARACTER_REEL_PREFIX}${projectId}`);
  return raw ?? null;
}

export async function invalidateCharacterReelCache(
  projectId: string
): Promise<void> {
  await redis.del(`${CHARACTER_REEL_PREFIX}${projectId}`);
}

// ---------------------------------------------------------------------------
// Speculative pre-generation cache
// Keyed by a hash of (motionPrompt + characterRefUrl) so it's content-addressable.
// Written by speculative-generate Inngest function; consumed by generate-scene.
// TTL: 15 minutes — enough time for a user to finish uploading character images.
// ---------------------------------------------------------------------------

const SPECULATIVE_PREFIX = "speculative:";
const SPECULATIVE_TTL = 900; // 15 minutes

export function computeSpeculativeKey(motionPrompt: string, characterRefUrl: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${motionPrompt}:${characterRefUrl}`)
    .digest("hex")
    .slice(0, 20);
  return `${SPECULATIVE_PREFIX}${hash}`;
}

export async function setSpeculativeCache(key: string, uprenderUrl: string): Promise<void> {
  await redis.set(key, uprenderUrl, { ex: SPECULATIVE_TTL });
}

// Atomically get and delete — prevents two concurrent generate-scene runs from
// both consuming the same speculative result (one would fall through to Flux).
export async function getAndDeleteSpeculativeCache(key: string): Promise<string | null> {
  const val = await redis.getdel(key);
  return (val as string | null) ?? null;
}
