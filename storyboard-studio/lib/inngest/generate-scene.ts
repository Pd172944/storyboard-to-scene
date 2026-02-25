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
import { submitWanR2VJob } from "@/lib/fal/wan";

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
    const reelUrl = await step.run("ensure-character-reel", async () => {
      // 1. Check Redis cache first
      const cached = await getCharacterReelCache(event.data.projectId);
      if (cached) return cached;

      // 2. Check Postgres
      const project = await prisma.project.findUnique({
        where: { id: event.data.projectId },
        select: {
          characterReelUrl: true,
          characterReelStatus: true,
          characterRefUrls: true,
        },
      });

      // 3. If reel already complete, cache it and return
      if (
        project?.characterReelStatus === "COMPLETE" &&
        project.characterReelUrl
      ) {
        await setCharacterReelCache(
          event.data.projectId,
          project.characterReelUrl
        );
        return project.characterReelUrl;
      }

      // 4. If no reference images uploaded, return null (Kling runs without reel)
      if (!project?.characterRefUrls?.length) return null;

      // 5. If reel is currently GENERATING (another scene submitted simultaneously),
      //    return null — we will waitForEvent below
      if (project.characterReelStatus === "GENERATING") {
        return null; // handled by waitForEvent below
      }

      // 6. Submit Wan R2V job
      await prisma.project.update({
        where: { id: event.data.projectId },
        data: { characterReelStatus: "GENERATING" },
      });

      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/wan`;
      const requestId = await submitWanR2VJob(
        project.characterRefUrls,
        webhookUrl
      );

      await prisma.project.update({
        where: { id: event.data.projectId },
        data: { wanRequestId: requestId },
      });

      return null; // will be resolved by waitForEvent
    });

    // Step 2b: If reel is not yet available but was submitted, wait for Wan completion
    let finalReelUrl = reelUrl;
    if (!reelUrl) {
      // Check if we need to wait for an in-flight Wan job
      const project = await step.run("check-wan-status", async () => {
        return prisma.project.findUnique({
          where: { id: event.data.projectId },
          select: { characterReelStatus: true, characterReelUrl: true },
        });
      });

      if (project?.characterReelStatus === "GENERATING") {
        const wanEvent = await step.waitForEvent("wait-for-wan", {
          event: "studio/wan.complete",
          timeout: "8m",
          if: `async.data.projectId == '${event.data.projectId}'`,
        });

        if (wanEvent) {
          finalReelUrl = wanEvent.data.reelUrl as string;
        } else {
          // Wan timed out — mark failed but don't block scene generation
          await step.run("mark-wan-timeout", async () => {
            await prisma.project.update({
              where: { id: event.data.projectId },
              data: { characterReelStatus: "FAILED" },
            });
          });
          finalReelUrl = null;
        }
      }
    }

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
