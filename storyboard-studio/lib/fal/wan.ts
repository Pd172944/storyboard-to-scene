import { fal } from "@/lib/fal/client";

const WAN_MODEL_ID = "fal-ai/wan/v2.6/reference-to-video/flash";

// ---------------------------------------------------------------------------
// Type definitions for fal API shapes
// ---------------------------------------------------------------------------

interface WanReferenceImage {
  image_url: string;
}

interface WanInput {
  reference_images: WanReferenceImage[];
  prompt: string;
  negative_prompt: string;
  num_frames: number;
  guidance_scale: number;
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
 * @param webhookUrl - URL for fal to POST completion to
 * @returns The request_id for tracking this job
 */
export async function submitWanR2VJob(
  referenceImageUrls: string[],
  webhookUrl: string
): Promise<string> {
  const { request_id } = await fal.queue.submit(WAN_MODEL_ID, {
    input: {
      reference_images: referenceImageUrls.map((url) => ({ image_url: url })),
      prompt:
        "A person standing in a neutral pose, looking at the camera, natural lighting, photorealistic",
      negative_prompt: "motion blur, action, multiple people, crowd",
      num_frames: 49, // ~4 seconds at 12fps
      guidance_scale: 7.5,
    } as WanInput,
    webhookUrl,
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
