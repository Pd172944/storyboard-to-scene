import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import {
  setJobState,
  deleteJobState,
  getCharacterReelCache,
  setCharacterReelCache,
} from "@/lib/redis";
import { upsampleSketch } from "@/lib/fal/flux";
import { submitKlingJob, waitForKlingCompletion } from "@/lib/fal/kling";
import { submitWanR2VJob, waitForWanCompletion } from "@/lib/fal/wan";

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

    // Step 2: Ensure character reel is available (or null if not applicable)
    const finalReelUrl = await step.run("ensure-character-reel", async () => {
      const projectId = event.data.projectId;

      // 1. Check Redis cache first
      const cached = await getCharacterReelCache(projectId);
      if (cached) return cached;

      // 2. Check Postgres
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          characterReelUrl: true,
          characterReelStatus: true,
          characterRefUrls: true,
          wanRequestId: true,
        },
      });

      // 3. If reel already complete, cache it and return
      if (
        project?.characterReelStatus === "COMPLETE" &&
        project.characterReelUrl
      ) {
        await setCharacterReelCache(projectId, project.characterReelUrl);
        return project.characterReelUrl;
      }

      // 4. If no reference images uploaded, return null (Kling runs without reel)
      if (!project?.characterRefUrls?.length) return null;

      // 5. If reel is currently GENERATING (another scene submitted simultaneously),
      //    poll the existing job instead of submitting a duplicate
      if (
        project.characterReelStatus === "GENERATING" &&
        project.wanRequestId
      ) {
        try {
          const reelUrl = await waitForWanCompletion(project.wanRequestId);
          // Persist result
          await prisma.project.update({
            where: { id: projectId },
            data: {
              characterReelUrl: reelUrl,
              characterReelStatus: "COMPLETE",
              wanRequestId: null,
            },
          });
          await setCharacterReelCache(projectId, reelUrl);
          return reelUrl;
        } catch (err) {
          console.error("Wan R2V poll failed for existing job:", err);
          await prisma.project.update({
            where: { id: projectId },
            data: { characterReelStatus: "FAILED", wanRequestId: null },
          });
          return null;
        }
      }

      // 6. Submit Wan R2V job and poll until complete
      await prisma.project.update({
        where: { id: projectId },
        data: { characterReelStatus: "GENERATING" },
      });

      const requestId = await submitWanR2VJob(project.characterRefUrls);

      await prisma.project.update({
        where: { id: projectId },
        data: { wanRequestId: requestId },
      });

      try {
        const reelUrl = await waitForWanCompletion(requestId);
        // Persist result
        await prisma.project.update({
          where: { id: projectId },
          data: {
            characterReelUrl: reelUrl,
            characterReelStatus: "COMPLETE",
            wanRequestId: null,
          },
        });
        await setCharacterReelCache(projectId, reelUrl);
        return reelUrl;
      } catch (err) {
        // Wan timed out or failed — mark failed but don't block scene generation
        console.error("Wan R2V generation failed:", err);
        await prisma.project.update({
          where: { id: projectId },
          data: { characterReelStatus: "FAILED", wanRequestId: null },
        });
        return null; // Kling will generate without reel — degraded but not broken
      }
    });

    // Step 3: Submit Kling image-to-video job and poll until complete
    const videoUrl = await step.run("generate-video", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "GENERATING_VIDEO" },
      });

      // Pass reelUrl if available — Kling uses it for character identity lock
      const requestId = await submitKlingJob(
        uprenderUrl,
        motionPrompt,
        finalReelUrl ?? undefined
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
