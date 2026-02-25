import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import { setJobState, deleteJobState } from "@/lib/redis";
import { upsampleSketch } from "@/lib/fal/flux";
import { submitKlingJob, waitForKlingCompletion } from "@/lib/fal/kling";

interface GenerateSceneEventData {
  sceneId: string;
  sketchDataUrl: string; // Now a fal storage URL (uploaded client-side)
  referenceImageUrl: string;
  motionPrompt: string;
  projectId: string;
}

export const generateScene = inngest.createFunction(
  {
    id: "generate-scene",
    retries: 2,
    cancelOn: [{ event: "studio/scene.cancel", match: "data.sceneId" }],
  },
  { event: "studio/scene.generate" },
  async ({ event, step }) => {
    const {
      sceneId,
      sketchDataUrl,
      referenceImageUrl,
      motionPrompt,
    } = event.data as GenerateSceneEventData;

    const now = Date.now();

    // sketchDataUrl is already a fal storage URL (uploaded client-side)
    const sketchUrl = sketchDataUrl;

    // Step 1: Uprender sketch with Flux Kontext
    const uprenderUrl = await step.run("uprender-sketch", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "UPRENDERING" },
      });
      await setJobState(sceneId, {
        sceneId,
        step: "uprendering",
        startedAt: now,
        heartbeatAt: Date.now(),
      });

      const url = await upsampleSketch(sketchUrl, referenceImageUrl, motionPrompt);

      await prisma.scene.update({
        where: { id: sceneId },
        data: { uprenderUrl: url },
      });

      return url;
    });

    // Step 2: Submit Kling image-to-video job and poll until complete
    const videoUrl = await step.run("generate-video", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "GENERATING_VIDEO" },
      });

      const requestId = await submitKlingJob(uprenderUrl, motionPrompt);

      await setJobState(sceneId, {
        sceneId,
        klingRequestId: requestId,
        step: "generating_video",
        startedAt: now,
        heartbeatAt: Date.now(),
      });

      // Poll until the video is ready (up to ~10 minutes)
      const url = await waitForKlingCompletion(requestId);
      return url;
    });

    // Step 3: Finalize — persist video URL to Postgres, clean up Redis
    await step.run("finalize", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          videoUrl,
          status: "COMPLETE",
        },
      });
      await deleteJobState(sceneId);
    });

    return {
      sceneId,
      videoUrl,
    };
  }
);
