import { Redis } from "@upstash/redis";

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
