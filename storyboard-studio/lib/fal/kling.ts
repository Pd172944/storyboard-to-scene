import { fal } from "@/lib/fal/client";

// Kling v1.6 Pro image-to-video — broadly accessible, stable Kling generation
export const KLING_MODEL_ID = "fal-ai/kling-video/v1.6/pro/image-to-video";

export interface KlingInput {
  prompt: string;
  image_url: string;
  duration?: "5" | "10";
  aspect_ratio?: "16:9" | "9:16" | "1:1";
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

// ---------------------------------------------------------------------------
// Hidden system prompt — wraps every user motion prompt without exposure in
// the UI. Tuned against the most common Kling failure modes: identity drift,
// jittery camera, rubbery physics, and temporal texture flickering.
// ---------------------------------------------------------------------------

const KLING_PREAMBLE = `Photorealistic live-action cinema. The provided start frame is the single source of truth for lighting, color grade, depth of field, subject identity, and atmospheric feel — replicate it exactly and animate outward from it.`;

const KLING_REQUIREMENTS = `Maintain throughout every frame of the clip: exact subject identity with zero facial drift or morphing, anatomically precise joint and limb movement with natural weight and momentum, realistic skin subsurface scattering and pore fidelity, natural hair dynamics with correct mass and secondary motion, fabric responding physically to movement, smooth and intentional camera motion with cinematic weight, physically accurate motion blur on fast elements, temporally stable background textures and lighting, color temperature and exposure matching the start frame.`;


function buildKlingPrompt(motionPrompt: string): string {
  return `${KLING_PREAMBLE} ${motionPrompt.trim()}. ${KLING_REQUIREMENTS}`;
}

// ---------------------------------------------------------------------------

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

  const data = result as unknown as KlingCreateVoiceOutput;

  if (!data?.voice_id) {
    throw new Error(
      "Kling create-voice completed but no voice_id in response"
    );
  }

  return data.voice_id;
}

export async function submitKlingJob(
  imageUrl: string,
  motionPrompt: string,
  _characterRefUrls?: string[],
  _voiceId?: string,
  webhookUrl?: string
): Promise<string> {
  const klingInput: KlingInput = {
    prompt: buildKlingPrompt(motionPrompt),
    image_url: imageUrl,
    duration: "5",
    aspect_ratio: "16:9",
  };

  try {
    const { request_id } = await fal.queue.submit(KLING_MODEL_ID, {
      input: klingInput,
      ...(webhookUrl ? { webhookUrl } : {}),
    });

    if (!request_id) {
      throw new Error("Kling submit did not return a request_id");
    }

    return request_id;
  } catch (err: unknown) {
    // Use duck-typing — instanceof ValidationError breaks across Turbopack module boundaries
    const apiErr = err as { status?: number; body?: Record<string, unknown> };
    if (apiErr?.status === 422) {
      const body = apiErr.body ?? {};
      const detail = Array.isArray(body.detail)
        ? (body.detail as Array<{ loc: (string | number)[]; msg: string }>)
            .map((e) => `[${e.loc.join(".")}] ${e.msg}`)
            .join("; ")
        : "";
      throw new Error(
        `Kling 422 on ${KLING_MODEL_ID} — ${detail || `body: ${JSON.stringify(body)}`}`
      );
    }
    throw err;
  }
}

const MAX_POLL_ATTEMPTS = 120; // 10 minutes at 5s intervals
const POLL_INTERVAL_MS = 5000;

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
