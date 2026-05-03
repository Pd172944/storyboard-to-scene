import { fal } from "@/lib/fal/client";

// Seedance v1 Pro — ByteDance's flagship image-to-video model.
// 1080p, up to 12s, 16:9. Open fal.ai API, no special access required.
const SEEDANCE_MODEL_ID = "fal-ai/bytedance/seedance/v1/pro/image-to-video";

interface SeedanceInput {
  prompt: string;
  image_url: string;
  duration?: "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12";
  resolution?: "480p" | "720p" | "1080p";
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "21:9" | "auto";
  camera_fixed?: boolean;
  seed?: number;
}

interface SeedanceOutput {
  video: { url: string };
  seed: number;
}

export interface SeedanceStatusResult {
  status: string;
  videoUrl?: string;
}

const SEEDANCE_PREAMBLE = `Photorealistic live-action cinema. The provided start frame is the single source of truth for lighting, color grade, depth of field, subject identity, and atmospheric feel — replicate it exactly and animate outward from it.`;

const SEEDANCE_REQUIREMENTS = `Maintain throughout every frame: exact subject identity with zero facial drift or morphing, anatomically precise joint and limb movement with natural weight and momentum, realistic skin subsurface scattering and pore fidelity, natural hair dynamics with correct mass and secondary motion, fabric responding physically to movement, smooth cinematic camera motion with appropriate inertia, physically accurate motion blur on fast-moving elements, temporally stable background textures and lighting, color temperature and exposure matching the start frame.`;

function buildSeedancePrompt(motionPrompt: string): string {
  return `${SEEDANCE_PREAMBLE} ${motionPrompt.trim()}. ${SEEDANCE_REQUIREMENTS}`;
}

export async function submitSeedanceJob(
  imageUrl: string,
  motionPrompt: string,
  webhookUrl?: string
): Promise<string> {
  const input: SeedanceInput = {
    prompt: buildSeedancePrompt(motionPrompt),
    image_url: imageUrl,
    duration: "5",
    resolution: "1080p",
    aspect_ratio: "16:9",
    camera_fixed: false,
  };

  try {
    const { request_id } = await fal.queue.submit(SEEDANCE_MODEL_ID, {
      input,
      ...(webhookUrl ? { webhookUrl } : {}),
    });

    if (!request_id) throw new Error("Seedance submit did not return a request_id");
    return request_id;
  } catch (err: unknown) {
    const apiErr = err as { status?: number; body?: Record<string, unknown> };
    if (apiErr?.status === 422) {
      const body = apiErr.body ?? {};
      const detail = Array.isArray(body.detail)
        ? (body.detail as Array<{ loc: (string | number)[]; msg: string }>)
            .map((e) => `[${e.loc.join(".")}] ${e.msg}`)
            .join("; ")
        : "";
      throw new Error(
        `Seedance 422 on ${SEEDANCE_MODEL_ID} — ${detail || `body: ${JSON.stringify(body)}`}`
      );
    }
    throw err;
  }
}

const MAX_POLL_ATTEMPTS = 300; // 10 min at 2s intervals
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForSeedanceCompletion(requestId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await getSeedanceStatus(requestId);
    if (result.status === "COMPLETED" && result.videoUrl) return result.videoUrl;
    if (result.status === "FAILED") throw new Error(`Seedance job ${requestId} failed`);
  }
  throw new Error(`Seedance job ${requestId} timed out`);
}

export async function getSeedanceStatus(requestId: string): Promise<SeedanceStatusResult> {
  const statusResponse = await fal.queue.status(SEEDANCE_MODEL_ID, {
    requestId,
    logs: false,
  });

  if (statusResponse.status === "COMPLETED") {
    const result = await fal.queue.result(SEEDANCE_MODEL_ID, { requestId });
    const data = result.data as unknown as SeedanceOutput;
    return { status: "COMPLETED", videoUrl: data?.video?.url };
  }

  return { status: statusResponse.status };
}

export { SEEDANCE_MODEL_ID };
