/**
 * Local inference adapter.
 *
 * Routes requests to the Python FastAPI sidecar (inference/server.py) instead
 * of fal.ai. Set INFERENCE_MODE=local and LOCAL_INFERENCE_URL=http://localhost:8765
 * in .env.local to activate.
 *
 * The local server uses:
 * - Flux Schnell for frame generation (CPU: sparse attention, GPU: Flash Attention)
 * - LTX-Video for draft video (GPU recommended — ~3min on CPU)
 *
 * Final video (Kling) always falls back to fal.ai since Kling is proprietary.
 */

const LOCAL_INFERENCE_URL =
  process.env.LOCAL_INFERENCE_URL ?? "http://localhost:8765";

interface LocalFrameResponse {
  image_url: string;
  latency_ms: number;
  device: string;
}

interface LocalVideoResponse {
  video_url: string;
  latency_ms: number;
  device: string;
}

export interface LocalHealthResponse {
  status: string;
  device: string;
  cuda_available: boolean;
  cuda_device_name: string | null;
  vram_total_gb: number | null;
  vram_free_gb: number | null;
  flux_loaded: boolean;
  ltx_loaded: boolean;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${LOCAL_INFERENCE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Long timeout — local inference can be slow on CPU
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Local inference ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function localGenerateFrame(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const result = await post<LocalFrameResponse>("/generate-frame", {
    image_url: imageUrl,
    prompt,
    num_steps: 4,
  });
  return result.image_url;
}

export async function localGenerateVideo(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const result = await post<LocalVideoResponse>("/generate-video", {
    image_url: imageUrl,
    prompt,
    num_frames: 33,
    num_steps: 16,
  });
  return result.video_url;
}

export async function getLocalInferenceHealth(): Promise<LocalHealthResponse | null> {
  try {
    const res = await fetch(`${LOCAL_INFERENCE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.json() as Promise<LocalHealthResponse>;
  } catch {
    return null;
  }
}
