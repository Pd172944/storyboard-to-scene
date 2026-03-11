import { fal } from "@/lib/fal/client";

const LTX_MODEL_ID = "fal-ai/ltx-video/image-to-video";

const MAX_POLL_ATTEMPTS = 72; // 6 minutes at 5s intervals
const POLL_INTERVAL_MS = 5000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface LtxInput {
  image_url: string;
  prompt: string;
  negative_prompt: string;
  num_frames: number;
  num_inference_steps: number;
  guidance_scale: number;
  resolution: string;
}

interface LtxVideoOutput {
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

/**
 * Submit an LTX-Video image-to-video draft job.
 *
 * LTX is the fast draft stage — 480p, low inference steps, generates in 3–8s.
 *
 * @param imageUrl - fal CDN URL of the photorealistic start frame (from Flux)
 * @param motionPrompt - scene description / motion prompt
 * @returns The request_id for this job
 */
export async function submitLtxJob(
  imageUrl: string,
  motionPrompt: string
): Promise<string> {
  const { request_id } = await fal.queue.submit(LTX_MODEL_ID, {
    input: {
      image_url: imageUrl,
      prompt: motionPrompt,
      negative_prompt: "worst quality, inconsistent motion, blurry, jittery, distorted",
      num_frames: 97,           // ~3 seconds at ~30fps
      num_inference_steps: 30,  // speed/quality sweet spot for drafts
      guidance_scale: 3.0,
      resolution: "480p",       // draft quality — prioritize speed
    } as LtxInput,
  });

  if (!request_id) {
    throw new Error("LTX submit did not return a request_id");
  }

  return request_id;
}

/**
 * Poll until the LTX job completes and return the video URL.
 *
 * Polls every 5 seconds for up to 6 minutes. LTX typically finishes in 5–30s.
 */
export async function waitForLtxCompletion(requestId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await getLtxStatus(requestId);
    if (result.status === "COMPLETED" && result.videoUrl) {
      return result.videoUrl;
    }
    if (result.status === "FAILED") {
      throw new Error(`LTX job ${requestId} failed`);
    }
  }
  throw new Error(`LTX job ${requestId} timed out after ${MAX_POLL_ATTEMPTS} poll attempts`);
}

/**
 * Check the status of an LTX job (used for polling fallback).
 *
 * @param requestId - The request_id from submitLtxJob
 * @returns Normalized status and optional video URL
 */
export async function getLtxStatus(requestId: string): Promise<LtxStatusResult> {
  const statusResponse = await fal.queue.status(LTX_MODEL_ID, {
    requestId,
    logs: false,
  });

  if (statusResponse.status === "COMPLETED") {
    const result = await fal.queue.result(LTX_MODEL_ID, { requestId });
    const data = result.data as unknown as LtxVideoOutput;
    return {
      status: "COMPLETED",
      videoUrl: data?.video?.url,
    };
  }

  return { status: statusResponse.status };
}
