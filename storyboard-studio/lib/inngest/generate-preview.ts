import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import { upsampleSketch } from "@/lib/fal/flux";
import { submitLtxJob } from "@/lib/fal/ltx";

interface PreviewGenerateEventData {
  sceneId: string;
  sketchDataUrl: string; // fal storage URL (uploaded client-side)
  motionPrompt: string;
  projectId: string;
}

/**
 * Draft preview workflow — intentionally lean, speed is the only goal.
 *
 * Does NOT use Wan, Chatterbox, or voice.
 * Pipeline: fetch-refs → uprender-sketch → submit-ltx → wait-for-ltx → save-preview
 *
 * LTX generates a low-quality 480p draft in 3–8 seconds so users can verify
 * motion and composition before committing to the 60–90 second Kling final render.
 */
export const generatePreview = inngest.createFunction(
  {
    id: "generate-preview",
    retries: 1, // drafts should be fast or fail fast
    cancelOn: [{ event: "studio/scene.cancel", match: "data.sceneId" }],
  },
  { event: "studio/preview.generate" },
  async ({ event, step }) => {
    const { sceneId, sketchDataUrl, motionPrompt, projectId } =
      event.data as PreviewGenerateEventData;

    // Step 1: Fetch character refs so Flux generates the correct character
    // in the start frame — even drafts should show the right person.
    const characterRefUrls = await step.run("fetch-character-refs-preview", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { characterRefUrls: true },
      });
      return project?.characterRefUrls ?? [];
    });

    // Step 2: Uprender sketch → photorealistic start frame.
    // If uprenderUrl already exists (e.g. retry after partial failure), reuse it.
    const uprenderUrl = await step.run("uprender-sketch-preview", async () => {
      const existing = await prisma.scene.findUnique({
        where: { id: sceneId },
        select: { uprenderUrl: true },
      });

      if (existing?.uprenderUrl) {
        // Reuse existing frame — avoid a second Flux charge on retry
        return existing.uprenderUrl;
      }

      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "PREVIEWING" },
      });

      const primaryRef = characterRefUrls.length > 0 ? characterRefUrls[0] : undefined;
      const url = await upsampleSketch(sketchDataUrl, motionPrompt, primaryRef);

      await prisma.scene.update({
        where: { id: sceneId },
        data: { uprenderUrl: url },
      });

      return url;
    });

    // Step 3: Submit LTX draft job with webhook notification.
    const ltxRequestId = await step.run("submit-ltx", async () => {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/ltx`;
      const requestId = await submitLtxJob(uprenderUrl, motionPrompt, webhookUrl);

      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          ltxRequestId: requestId,
          status: "PREVIEWING",
        },
      });

      return requestId;
    });

    // Step 4: Wait for LTX webhook to arrive (non-blocking — Inngest suspends here).
    // LTX is fast; 3-minute timeout is a conservative safety net.
    const completionEvent = await step.waitForEvent("wait-for-ltx", {
      event: "studio/ltx.complete",
      timeout: "3m",
      if: `async.data.ltxRequestId == '${ltxRequestId}'`,
    });

    if (!completionEvent) {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "PREVIEW_FAILED", ltxRequestId: null },
      });
      throw new Error(`LTX preview job ${ltxRequestId} timed out after 3 minutes`);
    }

    // Step 5: Save the draft video URL and mark the scene preview-ready.
    await step.run("save-preview", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          previewVideoUrl: completionEvent.data.videoUrl as string,
          status: "PREVIEW_READY",
          ltxRequestId: null,
        },
      });
    });

    return {
      sceneId,
      previewVideoUrl: completionEvent.data.videoUrl as string,
    };
  }
);
