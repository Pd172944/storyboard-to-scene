import { fal } from "@/lib/fal/client";
import { buildFalWebhookUrl } from "@/lib/fal/webhooks";
import { createKlingVoice } from "@/lib/fal/kling";
import { generatePreviewFrame, upsampleSketch } from "@/lib/fal/flux";
import { submitLtxJob, waitForLtxCompletion } from "@/lib/fal/ltx";
import { submitSeedanceJob, waitForSeedanceCompletion, SEEDANCE_MODEL_ID } from "@/lib/fal/seedance";
import { synthesizeDialogue } from "@/lib/fal/chatterbox";
import { localGenerateFrame, localGenerateVideo } from "@/lib/media/local";
import {
  runpodCancelFinalVideo,
  runpodCreateVoice,
  runpodGenerateFinalFrame,
  runpodGeneratePreviewFrame,
  runpodSubmitDraftVideo,
  runpodSubmitFinalVideo,
  runpodSynthesizeDialogue,
  waitForRunpodVideo,
} from "@/lib/media/runpod";
import type {
  DraftVideoInput,
  FinalFrameInput,
  FinalVideoInput,
  MediaBackend,
  MediaProvider,
  PreviewFrameInput,
  VideoJobHandle,
} from "@/lib/media/types";

function getMediaBackend(): MediaBackend {
  if (process.env.INFERENCE_MODE === "local") return "local";
  if (process.env.MEDIA_BACKEND === "runpod") return "runpod";
  return "fal";
}

const falProvider: MediaProvider = {
  backend: "fal",
  generatePreviewFrame(input: PreviewFrameInput) {
    return generatePreviewFrame(input.sketchUrl, input.motionPrompt, input.characterRefUrl);
  },
  generateFinalFrame(input: FinalFrameInput) {
    return upsampleSketch(input.sketchUrl, input.motionPrompt, input.characterRefUrl);
  },
  async submitDraftVideo(input: DraftVideoInput): Promise<VideoJobHandle> {
    const requestId = await submitLtxJob(
      input.imageUrl,
      input.motionPrompt,
      "frame",
      input.webhookUrl ?? buildFalWebhookUrl("/api/webhooks/ltx")
    );
    return { provider: "fal", requestId };
  },
  waitForDraftVideo(job: VideoJobHandle) {
    if (!job.requestId) {
      throw new Error("FAL draft video job missing requestId");
    }
    return waitForLtxCompletion(job.requestId);
  },
  async submitFinalVideo(input: FinalVideoInput): Promise<VideoJobHandle> {
    // Seedance v1 Pro — 1080p, 16:9, open fal.ai API (no special tier required).
    // Character identity is anchored by the Flux Kontext start frame.
    const requestId = await submitSeedanceJob(
      input.imageUrl,
      input.motionPrompt,
    );
    return { provider: "fal", requestId, model: "seedance" };
  },
  waitForFinalVideo(job: VideoJobHandle) {
    if (!job.requestId) {
      throw new Error("FAL final video job missing requestId");
    }
    return waitForSeedanceCompletion(job.requestId);
  },
  synthesizeDialogue,
  createVoice: createKlingVoice,
  async cancelFinalVideo(requestId: string) {
    await fal.queue.cancel(SEEDANCE_MODEL_ID, { requestId });
  },
};

const runpodProvider: MediaProvider = {
  backend: "runpod",
  generatePreviewFrame(input: PreviewFrameInput) {
    return runpodGeneratePreviewFrame(input);
  },
  generateFinalFrame(input: FinalFrameInput) {
    return runpodGenerateFinalFrame(input);
  },
  submitDraftVideo(input: DraftVideoInput) {
    return runpodSubmitDraftVideo(input);
  },
  waitForDraftVideo(job: VideoJobHandle) {
    return waitForRunpodVideo(job);
  },
  submitFinalVideo(input: FinalVideoInput) {
    return runpodSubmitFinalVideo(input);
  },
  waitForFinalVideo(job: VideoJobHandle) {
    return waitForRunpodVideo(job);
  },
  synthesizeDialogue(dialogue: string, voiceSampleUrl?: string) {
    return runpodSynthesizeDialogue({ dialogue, voiceSampleUrl });
  },
  createVoice(audioUrl: string, voiceName: string) {
    return runpodCreateVoice({ audioUrl, voiceName });
  },
  cancelFinalVideo: runpodCancelFinalVideo,
};

/**
 * Local inference provider — routes frame/video generation to the Python sidecar.
 * Final video (Kling) still uses fal.ai since Kling is proprietary.
 */
const localProvider: MediaProvider = {
  backend: "local",
  async generatePreviewFrame(input: PreviewFrameInput): Promise<string> {
    return localGenerateFrame(input.characterRefUrl ?? input.sketchUrl, input.motionPrompt);
  },
  async generateFinalFrame(input: FinalFrameInput): Promise<string> {
    return localGenerateFrame(input.characterRefUrl ?? input.sketchUrl, input.motionPrompt);
  },
  async submitDraftVideo(input: DraftVideoInput): Promise<VideoJobHandle> {
    const videoUrl = await localGenerateVideo(input.imageUrl, input.motionPrompt);
    return { provider: "local", videoUrl };
  },
  async waitForDraftVideo(job: VideoJobHandle): Promise<string> {
    if (!job.videoUrl) throw new Error("Local draft video missing videoUrl");
    return job.videoUrl;
  },
  async submitFinalVideo(input: FinalVideoInput): Promise<VideoJobHandle> {
    const requestId = await submitSeedanceJob(input.imageUrl, input.motionPrompt);
    return { provider: "fal", requestId, model: "seedance" };
  },
  waitForFinalVideo(job: VideoJobHandle): Promise<string> {
    if (!job.requestId) throw new Error("Final video job missing requestId");
    return waitForSeedanceCompletion(job.requestId);
  },
  synthesizeDialogue,
  createVoice: createKlingVoice,
  async cancelFinalVideo(requestId: string) {
    await fal.queue.cancel(SEEDANCE_MODEL_ID, { requestId });
  },
};

export function getMediaProvider(): MediaProvider {
  const backend = getMediaBackend();
  if (backend === "local") return localProvider;
  if (backend === "runpod") return runpodProvider;
  return falProvider;
}

export function isGpuEnabled(): boolean {
  return process.env.ENABLE_GPU === "true" || process.env.ENABLE_GPU === "1";
}
