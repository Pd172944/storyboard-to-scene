import { fal } from "@/lib/fal/client";

const KLING_MODEL_ID = "fal-ai/kling-video/v2.6/pro/image-to-video";

export interface KlingInput {
  image_url: string;
  prompt: string;
  duration: string;
}

export interface KlingOutput {
  video: {
    url: string;
    content_type: string;
    file_name: string;
    file_size: number;
  };
}

export interface KlingStatusResult {
  status: string;
  videoUrl?: string;
}

/**
 * Submit an image-to-video job to Kling 2.6 Pro via fal's async queue.
 *
 * @param imageUrl - URL of the photorealistic first frame
 * @param motionPrompt - text prompt describing motion and action
 * @returns The request_id for tracking this job
 */
export async function submitKlingJob(
  imageUrl: string,
  motionPrompt: string
): Promise<string> {
  const { request_id } = await fal.queue.submit(KLING_MODEL_ID, {
    input: {
      image_url: imageUrl,
      prompt: motionPrompt,
      duration: "5",
    } as KlingInput,
  });

  if (!request_id) {
    throw new Error("Kling submit did not return a request_id");
  }

  return request_id;
}

const MAX_POLL_ATTEMPTS = 120; // 10 minutes at 5s intervals
const POLL_INTERVAL_MS = 5000;

/**
 * Poll a Kling job until completion or timeout.
 *
 * @param requestId - The request_id from submitKlingJob
 * @returns The video URL
 */
export async function waitForKlingCompletion(
  requestId: string
): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const result = await getKlingStatus(requestId);

    if (result.status === "COMPLETED" && result.videoUrl) {
      return result.videoUrl;
    }
  }

  throw new Error(
    `Kling job ${requestId} timed out after ${MAX_POLL_ATTEMPTS} poll attempts`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check the status of a Kling job.
 *
 * @param requestId - The request_id from submitKlingJob
 * @returns Normalized status and optional video URL
 */
export async function getKlingStatus(
  requestId: string
): Promise<KlingStatusResult> {
  const statusResponse = await fal.queue.status(KLING_MODEL_ID, {
    requestId,
    logs: false,
  });

  if (statusResponse.status === "COMPLETED") {
    const result = await fal.queue.result(KLING_MODEL_ID, {
      requestId,
    });

    const data = result.data as unknown as KlingOutput;
    return {
      status: "COMPLETED",
      videoUrl: data?.video?.url,
    };
  }

  return {
    status: statusResponse.status,
  };
}
