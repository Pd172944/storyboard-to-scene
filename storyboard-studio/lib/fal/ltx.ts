import { fal } from "@/lib/fal/client";

const LTX_MODEL_ID = "fal-ai/ltx-video/image-to-video";

const MAX_POLL_ATTEMPTS = 120; // 4 minutes at 2s intervals
const POLL_INTERVAL_MS = 2000;

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

type LtxDraftMode = "sketch" | "frame";

function buildDraftPrompt(motionPrompt: string, mode: LtxDraftMode): string {
  if (mode === "sketch") {
    return `Generate a fast storyboard draft from this rough sketch. Keep the camera framing, composition, subject placement, and action implied by the sketch. Fill in missing detail only enough to make the motion readable. Prioritize speed and visual clarity over polish. Scene direction: ${motionPrompt}`;
  }

  return `Create a short photorealistic live-action video from this starting frame. Preserve realistic human features, natural skin texture, believable movement, cinematic lighting, and a real-camera look. Avoid animation, cartoon, illustration, stylized CGI, or rubbery motion. Scene action: ${motionPrompt}`;
}

/**
 * Submit an LTX-Video image-to-video draft job.
 *
 * LTX is the fast draft stage. For sketch inputs we bias toward speed and
 * composition readability so users can approve or reject the idea quickly.
 *
 * @param imageUrl - fal CDN URL of the uploaded sketch or prepared frame
 * @param motionPrompt - scene description / motion prompt
 * @param mode - whether the input is a rough sketch or a prepared frame
 * @returns The request_id for this job
 */
export async function submitLtxJob(
  imageUrl: string,
  motionPrompt: string,
  mode: LtxDraftMode = "frame"
): Promise<string> {
  const { request_id } = await fal.queue.submit(LTX_MODEL_ID, {
    input: {
      image_url: imageUrl,
      prompt: buildDraftPrompt(motionPrompt, mode),
      negative_prompt: "worst quality, animation, cartoon, anime, illustration, stylized, distorted face, deformed hands, rubbery motion, blurry, jittery",
      num_frames: mode === "sketch" ? 65 : 49,
      num_inference_steps: mode === "sketch" ? 20 : 20,
      guidance_scale: mode === "sketch" ? 2.5 : 3.0,
      resolution: "480p",
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
 * Polls every 2 seconds for up to 4 minutes. LTX is the fast path, so shorter
 * polling keeps the UI responsive once the job finishes.
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
