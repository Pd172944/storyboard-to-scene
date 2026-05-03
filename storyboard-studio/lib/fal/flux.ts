import { fal } from "@/lib/fal/client";

export interface FluxKontextInput {
  image_url: string;
  prompt: string;
  loras: never[];
  num_inference_steps?: number;
  guidance_scale?: number;
  output_format?: "jpeg" | "png";
  safety_tolerance?: "1" | "2" | "3" | "4" | "5" | "6";
}

export interface FluxKontextOutput {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
}

// Flux Pro Kontext Max — higher per-token inference budget vs standard Kontext.
// Produces sharper facial detail, better scene transformation, and stronger
// identity preservation at the same API surface.
const FLUX_MODEL_ID = "fal-ai/flux-pro/kontext/max";

const MAX_POLL_ATTEMPTS = 160; // ~4 min at 1.5s
const POLL_INTERVAL_MS = 1500;

// ---------------------------------------------------------------------------
// Hidden system prompt engineering.
//
// Flux Kontext is an IMAGE EDITING model, not a text-to-image model.
// It responds to edit instructions: explicit KEEP vs CHANGE structure
// consistently outperforms descriptive generation prompts.
//
// Key failure modes we guard against:
//   - Identity drift: Kontext can substitute a "more average" face if the
//     identity lock language is too weak
//   - Motion confusion: shot presets contain camera movement language
//     ("slow push-in", "tracking shot") that has no meaning for a still frame —
//     Kontext tries to interpret it and warps the image instead
//   - Stylization: without explicit cinema-realism anchors the model drifts
//     toward HDR, AI-art, or painterly aesthetics
// ---------------------------------------------------------------------------

// What Flux must never touch regardless of the scene prompt
const PRESERVE_BLOCK = `\
PRESERVE EXACTLY — do not alter any of the following:
• The person's face: geometry, bone structure, eye shape, nose, mouth, jawline
• Age: do not make younger or older
• Ethnicity and skin tone: match the reference exactly — do not westernize, lighten, or darken
• Hair: same color, texture, length, and style
• Body proportions and build
• Clothing: reproduce every garment from the reference identically — same shirt, jacket, trousers, shoes, colors, patterns, fit. Do NOT substitute "contextually appropriate" clothing. If the reference shows a red hoodie, the output must show that exact red hoodie regardless of the scene setting. Only change clothing if the scene description explicitly names a specific different garment.
• Accessories: glasses, jewelry, bags, hats — preserve all unless the scene explicitly removes them`;

// What Flux should actively transform
const TRANSFORM_PREAMBLE = `\
TRANSFORM — change only the following to match the scene description:
• Background, environment, and setting
• Ambient and directional lighting (color, angle, intensity)
• Atmospheric effects (fog, rain, dust, lens flare, bokeh depth)
• Camera framing and focal length implied by the shot type
• Color grade and mood consistent with the described setting`;

// Technical cinema quality bar
const QUALITY_BLOCK = `\
TECHNICAL QUALITY REQUIREMENTS:
• Photorealistic — looks like a frame captured on an ARRI Alexa or RED Monstro cinema camera
• Natural skin texture with subsurface scattering and pore detail — no plastic, no AI-smoothing
• Correct shadow falloff and light wrap on skin
• Professional depth of field: sharp subject, environment appropriate bokeh
• Cinematic color grade: accurate white balance, no HDR oversaturation
• Absolutely avoid: illustration, animation, cartoon, CGI look, painterly texture, stylized rendering, overexposed highlights`;

// Shot presets include motion language ("slow push-in", "tracking", "crane up")
// that is meaningless for a still image and actively degrades Kontext output.
// This function rewrites motion language into equivalent compositional intent.
const MOTION_TO_COMPOSITION: [RegExp, string][] = [
  [/slow (?:push|dolly)[- ]in/gi,        "tight framing with compressed depth"],
  [/slow (?:pull|dolly)[- ]back/gi,      "wide framing with environmental depth"],
  [/tracking shot/gi,                    "side-on framing at shoulder height"],
  [/handheld/gi,                         "intimate, slightly asymmetric framing"],
  [/crane (?:up|shot)/gi,               "elevated wide-angle framing, downward angle"],
  [/overhead (?:shot|angle)?/gi,         "top-down overhead framing"],
  [/(?:pov|first[- ]person)/gi,         "first-person eye-level framing"],
  [/dolly zoom/gi,                       "telephoto compression with wide-angle distortion"],
  [/(?:slow |subtle )?push[- ]in/gi,    "slight telephoto compression, close framing"],
  [/(?:slow |subtle )?pull[- ]back/gi,  "wide establishing framing"],
  [/camera (?:follows|tracks|moves|drifts|rises|descends)/gi, "cinematic framing"],
  [/(?:slow|subtle|gentle) /gi,         ""],
];

function resolveSceneAsStill(motionPrompt: string): string {
  let s = motionPrompt;
  for (const [pattern, replacement] of MOTION_TO_COMPOSITION) {
    s = s.replace(pattern, replacement);
  }
  // Collapse doubled spaces from removals
  return s.replace(/\s{2,}/g, " ").trim();
}

function buildCinematicFramePrompt(scenePrompt: string): string {
  const stillScene = resolveSceneAsStill(scenePrompt);

  return `Edit this reference photo into a cinema-quality still frame.

${PRESERVE_BLOCK}

${TRANSFORM_PREAMBLE}
Scene to create: ${stillScene}

This is a STILL PHOTOGRAPH — a single frozen moment, not a video frame. Render only what the camera sees at the decisive moment of the shot. There is no motion; express any implied movement through composition, blur, and lighting only.

${QUALITY_BLOCK}

Output: one subject unless the scene explicitly calls for additional people.`;
}

function getFirstImageUrl(data: unknown): string {
  const url = (data as FluxKontextOutput | undefined)?.images?.[0]?.url;
  if (!url) throw new Error("Flux completed but no image URL was returned");
  return url;
}

export async function upsampleSketch(
  sketchUrl: string,
  scenePrompt: string,
  characterRefUrl?: string
): Promise<string> {
  // The input is always a subject/character photo — never a storyboard document.
  // If the user uploaded a dedicated character ref, prefer it (sharper identity anchor).
  // Otherwise the seed photo they dropped on the homepage serves as the reference.
  const imageUrl = characterRefUrl ?? sketchUrl;
  const prompt = buildCinematicFramePrompt(scenePrompt);

  const { request_id } = await fal.queue.submit(FLUX_MODEL_ID, {
    input: {
      image_url: imageUrl,
      prompt,
      loras: [],
      num_inference_steps: 28,
      guidance_scale: 4.5,
      output_format: "jpeg",
      safety_tolerance: "5",
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
