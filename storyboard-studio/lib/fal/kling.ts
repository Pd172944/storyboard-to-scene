import { fal } from "@/lib/fal/client";

// Kling O3 Pro reference-to-video — supports `elements` for character identity
export const KLING_MODEL_ID = "fal-ai/kling-video/o3/pro/reference-to-video";

export interface KlingElement {
  frontal_image_url: string;
  reference_image_urls: string[];
}

export interface KlingInput {
  start_image_url: string;
  prompt: string;
  duration: string;
  elements?: KlingElement[];
  aspect_ratio?: string;
  generate_audio?: boolean;
  voice_id?: string;
}

interface KlingCreateVoiceOutput {
  voice_id: string;
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
 * Create a reusable Kling Voice ID from an audio file URL.
 *
 * The Voice ID is project-level and cached in Postgres — create it once,
 * reuse across all scenes. Pass the returned voiceId to submitKlingJob
 * to get native lip-synced audio baked into the video.
 *
 * @param audioUrl - fal CDN URL of the audio file (WAV from Chatterbox HD)
 * @param voiceName - a name to identify this voice in Kling
 * @returns The Kling voice_id string
 */
export async function createKlingVoice(
  audioUrl: string,
  voiceName: string
): Promise<string> {
  const result = await fal.run("fal-ai/kling-video/v2.6/pro/create-voice", {
    input: {
      audio_url: audioUrl,
      voice_name: voiceName,
    },
  });

  // fal.run() returns output directly
  const data = result as unknown as KlingCreateVoiceOutput;

  if (!data?.voice_id) {
    throw new Error(
      "Kling create-voice completed but no voice_id in response"
    );
  }

  return data.voice_id;
}

/**
 * Submit an image-to-video job to Kling O3 Pro reference-to-video.
 *
 * Uses `elements` to pass character reference images directly,
 * referenced in the prompt as @Element1.
 *
 * @param imageUrl - URL of the photorealistic first frame (start_image_url)
 * @param motionPrompt - text prompt describing motion and action
 * @param characterRefUrls - optional array of character reference image URLs (1–3)
 * @param voiceId - optional Kling Voice ID for native lip-synced audio
 * @returns The request_id for tracking this job
 */
export async function submitKlingJob(
  imageUrl: string,
  motionPrompt: string,
  characterRefUrls?: string[],
  voiceId?: string
): Promise<string> {
  // Build elements array if character references are provided
  let elements: KlingElement[] | undefined;
  let prompt = motionPrompt;

  if (characterRefUrls && characterRefUrls.length > 0) {
    // First image is the frontal/primary reference, rest are supplementary
    const [frontalUrl, ...restUrls] = characterRefUrls;
    elements = [
      {
        frontal_image_url: frontalUrl,
        reference_image_urls:
          restUrls.length > 0 ? restUrls : [frontalUrl],
      },
    ];
    // Prepend @Element1 to prompt so Kling uses the character identity
    if (!prompt.includes("@Element1")) {
      prompt = `@Element1 ${prompt}`;
    }
  }

  const { request_id } = await fal.queue.submit(KLING_MODEL_ID, {
    input: {
      start_image_url: imageUrl,
      prompt,
      duration: "5",
      aspect_ratio: "16:9",
      // Enable audio when a voice ID is provided; Kling will lip-sync the character
      generate_audio: !!voiceId,
      ...(elements && { elements }),
      ...(voiceId && { voice_id: voiceId }),
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
