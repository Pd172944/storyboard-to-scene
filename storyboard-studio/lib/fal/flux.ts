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

const FLUX_MODEL_ID = "fal-ai/flux-pro/kontext/max";
const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 3000;

/**
 * Uprender a rough sketch into a photorealistic frame using Flux Kontext.
 *
 * @param sketchUrl - fal CDN URL of the uploaded sketch
 * @param scenePrompt - text prompt describing the scene and motion
 * @returns URL of the generated photorealistic image
 */
export async function upsampleSketch(
  sketchUrl: string,
  scenePrompt: string
): Promise<string> {
  const prompt = `Transform this rough sketch into a high quality, photorealistic scene. Scene description: ${scenePrompt}. Maintain the exact composition, poses, and layout from the sketch. Make it look like a professional photograph with natural lighting and realistic textures.`;

  const { request_id } = await fal.queue.submit(FLUX_MODEL_ID, {
    input: {
      image_url: sketchUrl,
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

      const data = result.data as unknown as FluxKontextOutput;
      const imageUrl = data?.images?.[0]?.url;
      if (!imageUrl) {
        throw new Error(
          "Flux Kontext completed but no image URL in response"
        );
      }
      return imageUrl;
    }
  }

  throw new Error(
    `Flux Kontext job ${request_id} timed out after ${MAX_POLL_ATTEMPTS} attempts`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
