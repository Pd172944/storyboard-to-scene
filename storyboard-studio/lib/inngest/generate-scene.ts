import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import {
  setJobState,
  deleteJobState,
} from "@/lib/redis";
import { upsampleSketch } from "@/lib/fal/flux";
import { submitKlingJob, waitForKlingCompletion } from "@/lib/fal/kling";

interface GenerateSceneEventData {
  sceneId: string;
  sketchDataUrl: string; // Now a fal storage URL (uploaded client-side)
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
      motionPrompt,
      projectId,
    } = event.data as GenerateSceneEventData;

    const now = Date.now();

    // sketchDataUrl is already a fal storage URL (uploaded client-side)
    const sketchUrl = sketchDataUrl;

    // Step 1: Fetch character reference images FIRST so Flux can use them for
    // identity anchoring. Without this, Flux generates a random person from the
    // sketch alone and Kling has to fight against the wrong start frame.
    const characterRefUrls = await step.run("fetch-character-refs", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { characterRefUrls: true },
      });
      return project?.characterRefUrls ?? [];
    });

    // Step 2: Uprender sketch with Flux Kontext.
    // When character refs are available, pass the primary ref as the Flux input
    // image so the generated start frame has the correct character identity.
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

      // Use first ref as the identity anchor for Flux; fall back to sketch if none
      const primaryRef = characterRefUrls.length > 0 ? characterRefUrls[0] : undefined;
      const url = await upsampleSketch(sketchUrl, motionPrompt, primaryRef);

      await prisma.scene.update({
        where: { id: sceneId },
        data: { uprenderUrl: url },
      });

      return url;
    });

    // Step 3: Submit Kling O3 Pro R2V job with character elements and poll until complete
    const videoUrl = await step.run("generate-video", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "GENERATING_VIDEO" },
      });

      // Pass character ref URLs directly to Kling as elements
      const requestId = await submitKlingJob(
        uprenderUrl,
        motionPrompt,
        characterRefUrls.length > 0 ? characterRefUrls : undefined
      );

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

    // Step 4: Finalize — persist video URL to Postgres, clean up Redis
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
