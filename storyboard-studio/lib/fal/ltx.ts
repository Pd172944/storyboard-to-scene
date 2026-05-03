import { fal } from "@/lib/fal/client";

// LTX-Video 2.3 — Lightricks open-weight 22B model
// Native 1080p output, 6-second clips at 24fps.
// Used as the final renderer for scenes without character refs
// (replacing Kling O3 Pro, which is reserved for `elements`-based identity lock).
const LTX_MODEL_ID = "fal-ai/ltx-2.3/image-to-video";
const LTX_FAST_MODEL_ID = "fal-ai/ltx-2.3/image-to-video/fast";

const MAX_POLL_ATTEMPTS = 120; // 4 minutes at 2s intervals
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Ltx23Input {
  image_url: string;
  prompt: string;
  duration?: "6" | "8" | "10";
  resolution?: "1080p" | "1440p" | "2160p";
  aspect_ratio?: "auto" | "16:9" | "9:16";
  fps?: "24" | "25" | "48" | "50"; // strings, not numbers
  generate_audio?: boolean;
  end_image_url?: string;
}

interface Ltx23VideoOutput {
  video: {
    url: string;
    content_type: string;
    file_name: string;
    file_size: number;
  };
}

interface LtxStatusResult {
  status: string;
  videoUrl?: string;
}

// ---------------------------------------------------------------------------
// Hidden system prompts — never surfaced in UI.
//
// Final prompt: maximises temporal coherence, identity stability, and
// cinematic quality from the Flux Kontext Max start frame.
//
// Draft prompt: leaner — we want the draft fast and readable, not perfect.
// ---------------------------------------------------------------------------

const LTX_PREAMBLE = `Photorealistic live-action cinema. The provided start frame is the visual ground truth — replicate its subject identity, lighting, color grade, depth of field, and atmosphere exactly and animate outward from it.`;

const LTX_MOTION_REQUIREMENTS = `Motion requirements: smooth, physically grounded movement with natural weight and momentum, anatomically correct joint articulation, realistic secondary motion on hair and clothing, ground-truthed shadow tracking, stable facial identity and skin texture throughout all frames, natural motion blur on fast-moving elements, cinematic camera behavior with appropriate inertia.`;

const LTX_QUALITY_REQUIREMENTS = `Visual quality: photorealistic skin texture with subsurface scattering fidelity, sharp and stable facial detail, accurate depth of field matching the start frame, temporally coherent background textures, consistent color grading and exposure across the full duration of the clip.`;

function buildFinalPrompt(motionPrompt: string): string {
  return `${LTX_PREAMBLE} ${motionPrompt.trim()}. ${LTX_MOTION_REQUIREMENTS} ${LTX_QUALITY_REQUIREMENTS}`;
}

function buildDraftPrompt(motionPrompt: string): string {
  // Lean prompt for the fast draft model — clarity over verbosity
  return `Photorealistic live-action video animating from the start frame. ${motionPrompt.trim()}. Smooth natural motion, stable identity, cinematic lighting consistent with start frame.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submit a final-quality LTX 2.3 render — 1080p, 6s, 24fps.
 * Used as the final video renderer for scenes without character refs.
 */
export async function submitLtxFinalJob(
  imageUrl: string,
  motionPrompt: string,
  webhookUrl?: string
): Promise<string> {
  const { request_id } = await fal.queue.submit(LTX_MODEL_ID, {
    input: {
      image_url: imageUrl,
      prompt: buildFinalPrompt(motionPrompt),
      duration: "6",
      resolution: "1080p",
      aspect_ratio: "16:9",
      fps: "25",
      generate_audio: false,
    } as Ltx23Input,
    ...(webhookUrl ? { webhookUrl } : {}),
  });

  if (!request_id) throw new Error("LTX 2.3 submit did not return a request_id");
  return request_id;
}

/**
 * Submit a fast draft job using the LTX 2.3 fast variant.
 * Used for draft preview when one is needed.
 */
export async function submitLtxJob(
  imageUrl: string,
  motionPrompt: string,
  _mode?: string,
  webhookUrl?: string
): Promise<string> {
  const { request_id } = await fal.queue.submit(LTX_FAST_MODEL_ID, {
    input: {
      image_url: imageUrl,
      prompt: buildDraftPrompt(motionPrompt),
      duration: "6",
      resolution: "1080p",
      aspect_ratio: "16:9",
      fps: "25",
      generate_audio: false,
    } as Ltx23Input,
    ...(webhookUrl ? { webhookUrl } : {}),
  });

  if (!request_id) throw new Error("LTX 2.3 fast submit did not return a request_id");
  return request_id;
}

export async function waitForLtxCompletion(requestId: string, modelId = LTX_MODEL_ID): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await getLtxStatus(requestId, modelId);
    if (result.status === "COMPLETED" && result.videoUrl) return result.videoUrl;
    if (result.status === "FAILED") throw new Error(`LTX 2.3 job ${requestId} failed`);
  }
  throw new Error(`LTX 2.3 job ${requestId} timed out`);
}

export async function waitForLtxFinalCompletion(requestId: string): Promise<string> {
  return waitForLtxCompletion(requestId, LTX_MODEL_ID);
}

export async function getLtxStatus(requestId: string, modelId = LTX_MODEL_ID): Promise<LtxStatusResult> {
  const statusResponse = await fal.queue.status(modelId, {
    requestId,
    logs: false,
  });

  if (statusResponse.status === "COMPLETED") {
    const result = await fal.queue.result(modelId, { requestId });
    const data = result.data as unknown as Ltx23VideoOutput;
    return { status: "COMPLETED", videoUrl: data?.video?.url };
  }

  return { status: statusResponse.status };
}
