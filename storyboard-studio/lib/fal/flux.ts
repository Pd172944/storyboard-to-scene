import { fal } from "@/lib/fal/client";

export interface FluxKontextInput {
  image_url: string;
  prompt: string;
  loras: never[];
}

export interface FluxKontextOutput {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
}

const FLUX_MODEL_ID = "fal-ai/flux-pro/kontext";
const MAX_POLL_ATTEMPTS = 60; // Increased to 3 minutes to avoid timeout
const POLL_INTERVAL_MS = 3000;

function getFirstImageUrl(data: unknown): string {
  const resultImageUrl = (data as FluxKontextOutput | undefined)?.images?.[0]?.url;
  if (!resultImageUrl) {
    throw new Error("Flux completed but no image URL was returned");
  }
  return resultImageUrl;
}

/**
 * Uprender a rough sketch into a photorealistic frame using Flux Kontext.
 *
 * When a character reference image is provided, Flux uses it as the base input
 * so the generated frame has the correct character identity. Flux edits the
 * reference photo into the desired scene while preserving the character's face,
 * skin tone, hair, and clothing — giving Kling a correct start frame to animate.
 *
 * Without a reference, falls back to sketch-based uprendering.
 *
 * @param sketchUrl - fal CDN URL of the uploaded sketch (used as fallback)
 * @param scenePrompt - text prompt describing the scene and motion
 * @param characterRefUrl - optional URL of the primary character reference image
 * @returns URL of the generated photorealistic image
 */
export async function upsampleSketch(
  sketchUrl: string,
  scenePrompt: string,
  characterRefUrl?: string
): Promise<string> {
  let imageUrl: string;
  let prompt: string;

  if (characterRefUrl) {
    // Use the reference photo as Flux's input image.
    // Flux Kontext will edit it — preserving the character's appearance —
    // while transforming the scene to match the prompt.
    imageUrl = characterRefUrl;
    prompt = `You are given a reference photo of a character. Preserve this character's exact appearance: their face, skin tone, hair color, hair style, and clothing must remain IDENTICAL to the reference. Do not alter the character's identity in any way.

Transform the scene and setting around them to match this description: ${scenePrompt}

Requirements:
- Character appearance: EXACTLY as shown in the reference photo (do not change face, ethnicity, hair, or clothing)
- Scene/setting: as described above
- Style: photorealistic, live-action cinema frame, real human skin texture, realistic facial structure, professional photography, cinematic quality, natural lighting
- Absolutely avoid: animation, cartoon, anime, illustration, painterly, stylized CGI
- Only one person (the character from the reference) unless the scene description explicitly requires others`;
  } else {
    // No character ref — use sketch as the base for composition guidance
    imageUrl = sketchUrl;
    prompt = `Transform this rough sketch into a high quality, photorealistic live-action scene. Scene description: ${scenePrompt}. Maintain the exact composition, poses, and layout from the sketch. Make it look like a frame from a real film shot with a camera. The people must look like real human beings with natural skin texture, realistic facial features, and believable clothing. No animation, cartoon, anime, illustration, painterly, or stylized CGI look.`;
  }

  const { request_id } = await fal.queue.submit(FLUX_MODEL_ID, {
    input: {
      image_url: imageUrl,
      prompt,
      loras: [],
    } as FluxKontextInput,
  });

  if (!request_id) {
    throw new Error("Flux Kontext submit did not return a request_id");
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const statusResponse = await fal.queue.status(FLUX_MODEL_ID, {
      requestId: request_id,
      logs: false,
    });

    if (statusResponse.status === "COMPLETED") {
      const result = await fal.queue.result(FLUX_MODEL_ID, {
        requestId: request_id,
      });

      return getFirstImageUrl(result.data);
    }
  }

  throw new Error(
    `Flux Kontext job ${request_id} timed out after ${MAX_POLL_ATTEMPTS} attempts`
  );
}

export async function generatePreviewFrame(
  sketchUrl: string,
  scenePrompt: string,
  characterRefUrl?: string
): Promise<string> {
  return upsampleSketch(sketchUrl, scenePrompt, characterRefUrl);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
