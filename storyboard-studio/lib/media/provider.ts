import { fal } from "@/lib/fal/client";
import { createKlingVoice, KLING_MODEL_ID, submitKlingJob, waitForKlingCompletion } from "@/lib/fal/kling";
import { generatePreviewFrame, upsampleSketch } from "@/lib/fal/flux";
import { submitLtxJob, waitForLtxCompletion } from "@/lib/fal/ltx";
import { synthesizeDialogue } from "@/lib/fal/chatterbox";
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
  return process.env.MEDIA_BACKEND === "runpod" ? "runpod" : "fal";
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
    const requestId = await submitLtxJob(input.imageUrl, input.motionPrompt, "frame");
    return { provider: "fal", requestId };
  },
  waitForDraftVideo(job: VideoJobHandle) {
    if (!job.requestId) {
      throw new Error("FAL draft video job missing requestId");
    }
    return waitForLtxCompletion(job.requestId);
  },
  async submitFinalVideo(input: FinalVideoInput): Promise<VideoJobHandle> {
    const requestId = await submitKlingJob(
      input.imageUrl,
      input.motionPrompt,
      input.characterRefUrls,
      input.voiceId
    );

    return { provider: "fal", requestId };
  },
  waitForFinalVideo(job: VideoJobHandle) {
    if (!job.requestId) {
      throw new Error("FAL final video job missing requestId");
    }
    return waitForKlingCompletion(job.requestId);
  },
  synthesizeDialogue,
  createVoice: createKlingVoice,
  async cancelFinalVideo(requestId: string) {
    await fal.queue.cancel(KLING_MODEL_ID, { requestId });
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

export function getMediaProvider(): MediaProvider {
  return getMediaBackend() === "runpod" ? runpodProvider : falProvider;
}

