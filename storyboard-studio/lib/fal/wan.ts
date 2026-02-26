import { fal } from "@/lib/fal/client";

const WAN_MODEL_ID = "wan/v2.6/reference-to-video/flash";

// ---------------------------------------------------------------------------
// Type definitions for fal API shapes
// ---------------------------------------------------------------------------

interface WanInput {
  image_urls: string[];
  prompt: string;
  negative_prompt: string;
  duration: string;
  resolution: string;
  aspect_ratio: string;
  enable_audio: boolean;
  enable_prompt_expansion: boolean;
}

interface WanVideoOutput {
  url: string;
  content_type: string;
  file_name: string;
  file_size: number;
}

interface WanOutput {
  video: WanVideoOutput;
}

interface WanStatusResponse {
  status: string;
}

// ---------------------------------------------------------------------------
// submitWanR2VJob
// ---------------------------------------------------------------------------

/**
 * Submit a Wan 2.6 Reference-to-Video job to generate a neutral character reel.
 *
 * @param referenceImageUrls - 1–3 fal storage URLs of reference photos
 * @param webhookUrl - Optional URL for fal to POST completion to
 * @returns The request_id for tracking this job
 */
export async function submitWanR2VJob(
  referenceImageUrls: string[],
  webhookUrl?: string
): Promise<string> {
  const { request_id } = await fal.queue.submit(WAN_MODEL_ID, {
    input: {
      image_urls: referenceImageUrls,
      prompt:
        "Character1 standing in a neutral pose, slowly looking at the camera, natural soft lighting, clean background, photorealistic",
      negative_prompt:
        "low resolution, error, worst quality, low quality, defects, motion blur, multiple people, crowd",
      duration: "5",
      resolution: "720p",
      aspect_ratio: "16:9",
      enable_audio: false,
      enable_prompt_expansion: false,
    } as WanInput,
    ...(webhookUrl ? { webhookUrl } : {}),
  });

  if (!request_id) {
    throw new Error("Wan R2V submit did not return a request_id");
  }

  return request_id;
}

// ---------------------------------------------------------------------------
// getWanStatus
// ---------------------------------------------------------------------------

/**
 * Check the status of a Wan R2V job.
 *
 * @param requestId - The request_id from submitWanR2VJob
 * @returns Normalized status and optional video URL
 */
export async function getWanStatus(
  requestId: string
): Promise<{ status: string; videoUrl?: string }> {
  const statusResponse = (await fal.queue.status(WAN_MODEL_ID, {
    requestId,
    logs: false,
  })) as WanStatusResponse;

  if (statusResponse.status === "COMPLETED") {
    const result = await fal.queue.result(WAN_MODEL_ID, { requestId });
    const data = result.data as unknown as WanOutput;
    return {
      status: "COMPLETED",
      videoUrl: data?.video?.url,
    };
  }

  return {
    status: statusResponse.status,
  };
}

// ---------------------------------------------------------------------------
// waitForWanCompletion — poll-based (no webhook needed)
// ---------------------------------------------------------------------------

const WAN_MAX_POLL_ATTEMPTS = 96; // 8 minutes at 5s intervals
const WAN_POLL_INTERVAL_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll a Wan R2V job until completion or timeout.
 *
 * @param requestId - The request_id from submitWanR2VJob
 * @returns The video URL of the generated character reel
 */
export async function waitForWanCompletion(
  requestId: string
): Promise<string> {
  for (let attempt = 0; attempt < WAN_MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(WAN_POLL_INTERVAL_MS);

    const result = await getWanStatus(requestId);

    if (result.status === "COMPLETED" && result.videoUrl) {
      return result.videoUrl;
    }
  }

  throw new Error(
    `Wan R2V job ${requestId} timed out after ${WAN_MAX_POLL_ATTEMPTS} poll attempts`
  );
}
