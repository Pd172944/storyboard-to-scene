import { randomUUID } from "crypto";
import type { VideoJobHandle } from "@/lib/media/types";

type RunpodTask =
  | "preview-frame"
  | "final-frame"
  | "draft-video"
  | "final-video"
  | "dialogue-audio"
  | "create-voice"
  | "cancel-final-video";

interface RunpodConfig {
  apiKey?: string;
  baseUrl?: string;
  previewFrameEndpoint?: string;
  finalFrameEndpoint?: string;
  draftVideoEndpoint?: string;
  finalVideoEndpoint?: string;
  dialogueEndpoint?: string;
  createVoiceEndpoint?: string;
  videoStatusEndpoint?: string;
  cancelVideoEndpoint?: string;
}

interface RunpodVideoStatusResponse {
  status?: string;
  videoUrl?: string;
  output?: {
    videoUrl?: string;
    video?: {
      url?: string;
    };
  };
}

const config: RunpodConfig = {
  apiKey: process.env.RUNPOD_API_KEY,
  baseUrl: process.env.RUNPOD_API_BASE_URL,
  previewFrameEndpoint: process.env.RUNPOD_PREVIEW_FRAME_ENDPOINT,
  finalFrameEndpoint: process.env.RUNPOD_FINAL_FRAME_ENDPOINT,
  draftVideoEndpoint: process.env.RUNPOD_DRAFT_VIDEO_ENDPOINT,
  finalVideoEndpoint: process.env.RUNPOD_FINAL_VIDEO_ENDPOINT,
  dialogueEndpoint: process.env.RUNPOD_DIALOGUE_ENDPOINT,
  createVoiceEndpoint: process.env.RUNPOD_CREATE_VOICE_ENDPOINT,
  videoStatusEndpoint: process.env.RUNPOD_VIDEO_STATUS_ENDPOINT,
  cancelVideoEndpoint: process.env.RUNPOD_CANCEL_VIDEO_ENDPOINT,
};

function resolveEndpoint(endpoint: string | undefined, task: RunpodTask): string {
  if (!endpoint) {
    throw new Error(`Runpod endpoint for ${task} is not configured`);
  }

  if (/^https?:\/\//.test(endpoint)) {
    return endpoint;
  }

  if (!config.baseUrl) {
    throw new Error(`RUNPOD_API_BASE_URL is required when ${task} uses a relative endpoint`);
  }

  return `${config.baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
}

async function postRunpod<T>(
  endpoint: string | undefined,
  task: RunpodTask,
  body: unknown
): Promise<T> {
  const url = resolveEndpoint(endpoint, task);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Runpod ${task} request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T;
}

function firstString(values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractUrl(payload: Record<string, unknown>, kind: "image" | "video" | "audio"): string {
  const url = firstString([
    payload[`${kind}Url`],
    payload.url,
    typeof payload.output === "object" && payload.output !== null
      ? (payload.output as Record<string, unknown>)[`${kind}Url`]
      : undefined,
    typeof payload.output === "object" && payload.output !== null
      ? (payload.output as Record<string, unknown>).url
      : undefined,
    typeof payload[kind] === "object" && payload[kind] !== null
      ? (payload[kind] as Record<string, unknown>).url
      : undefined,
    typeof payload.output === "object" && payload.output !== null
      ? (() => {
          const nested = (payload.output as Record<string, unknown>)[kind];
          return typeof nested === "object" && nested !== null
            ? (nested as Record<string, unknown>).url
            : undefined;
        })()
      : undefined,
  ]);

  if (!url) {
    throw new Error(`Runpod ${kind} response did not contain a usable URL`);
  }

  return url;
}

export async function runpodGeneratePreviewFrame(input: {
  sketchUrl: string;
  motionPrompt: string;
  characterRefUrl?: string;
}): Promise<string> {
  const result = await postRunpod<Record<string, unknown>>(
    config.previewFrameEndpoint,
    "preview-frame",
    input
  );

  return extractUrl(result, "image");
}

export async function runpodGenerateFinalFrame(input: {
  sketchUrl: string;
  motionPrompt: string;
  characterRefUrl?: string;
}): Promise<string> {
  const result = await postRunpod<Record<string, unknown>>(
    config.finalFrameEndpoint ?? config.previewFrameEndpoint,
    "final-frame",
    input
  );

  return extractUrl(result, "image");
}

function normalizeVideoJobResponse(payload: Record<string, unknown>): VideoJobHandle {
  const videoUrl = firstString([
    payload.videoUrl,
    payload.url,
    typeof payload.output === "object" && payload.output !== null
      ? (payload.output as Record<string, unknown>).videoUrl
      : undefined,
    typeof payload.output === "object" && payload.output !== null
      ? (payload.output as Record<string, unknown>).url
      : undefined,
    typeof payload.video === "object" && payload.video !== null
      ? (payload.video as Record<string, unknown>).url
      : undefined,
  ]);

  const requestId = firstString([
    payload.requestId,
    payload.id,
    typeof payload.output === "object" && payload.output !== null
      ? (payload.output as Record<string, unknown>).requestId
      : undefined,
  ]);

  return {
    provider: "runpod",
    requestId: requestId ?? (videoUrl ? randomUUID() : undefined),
    videoUrl,
  };
}

export async function runpodSubmitDraftVideo(input: {
  imageUrl: string;
  motionPrompt: string;
}): Promise<VideoJobHandle> {
  const result = await postRunpod<Record<string, unknown>>(
    config.draftVideoEndpoint,
    "draft-video",
    input
  );

  return normalizeVideoJobResponse(result);
}

export async function runpodSubmitFinalVideo(input: {
  imageUrl: string;
  motionPrompt: string;
  characterRefUrls?: string[];
  voiceId?: string;
}): Promise<VideoJobHandle> {
  const result = await postRunpod<Record<string, unknown>>(
    config.finalVideoEndpoint,
    "final-video",
    input
  );

  return normalizeVideoJobResponse(result);
}

export async function waitForRunpodVideo(job: VideoJobHandle): Promise<string> {
  if (job.videoUrl) {
    return job.videoUrl;
  }

  if (!job.requestId) {
    throw new Error("Runpod video job did not include a requestId or videoUrl");
  }

  if (!config.videoStatusEndpoint) {
    throw new Error("RUNPOD_VIDEO_STATUS_ENDPOINT is required for async Runpod video jobs");
  }

  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = await postRunpod<RunpodVideoStatusResponse>(
      config.videoStatusEndpoint,
      "draft-video",
      { requestId: job.requestId }
    );

    const status = result.status?.toUpperCase();
    const videoUrl = firstString([
      result.videoUrl,
      result.output?.videoUrl,
      result.output?.video?.url,
    ]);

    if (videoUrl) {
      return videoUrl;
    }

    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(`Runpod video job ${job.requestId} ${status.toLowerCase()}`);
    }
  }

  throw new Error(`Runpod video job ${job.requestId} timed out`);
}

export async function runpodSynthesizeDialogue(input: {
  dialogue: string;
  voiceSampleUrl?: string;
}): Promise<string> {
  const result = await postRunpod<Record<string, unknown>>(
    config.dialogueEndpoint,
    "dialogue-audio",
    input
  );

  return extractUrl(result, "audio");
}

export async function runpodCreateVoice(input: {
  audioUrl: string;
  voiceName: string;
}): Promise<string> {
  const result = await postRunpod<Record<string, unknown>>(
    config.createVoiceEndpoint,
    "create-voice",
    input
  );

  const voiceId = firstString([
    result.voiceId,
    result.voice_id,
    typeof result.output === "object" && result.output !== null
      ? (result.output as Record<string, unknown>).voiceId
      : undefined,
    typeof result.output === "object" && result.output !== null
      ? (result.output as Record<string, unknown>).voice_id
      : undefined,
  ]);

  if (!voiceId) {
    throw new Error("Runpod create voice response did not contain a voiceId");
  }

  return voiceId;
}

export async function runpodCancelFinalVideo(requestId: string): Promise<void> {
  if (!config.cancelVideoEndpoint) {
    return;
  }

  await postRunpod<Record<string, unknown>>(
    config.cancelVideoEndpoint,
    "cancel-final-video",
    { requestId }
  );
}
