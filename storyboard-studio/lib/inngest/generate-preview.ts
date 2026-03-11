import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import { submitLtxJob, waitForLtxCompletion } from "@/lib/fal/ltx";

interface PreviewGenerateEventData {
  sceneId: string;
  sketchDataUrl: string; // fal storage URL (uploaded client-side)
  motionPrompt: string;
  projectId: string;
}

/**
 * Draft preview workflow — intentionally lean, speed is the only goal.
 *
 * Passes the sketch directly to LTX — no Flux uprender for drafts.
 * Flux only runs once, during the final render (generate-scene.ts), where
 * the uprenderUrl is then cached and reused for any subsequent re-renders.
 *
 * Pipeline: submit-ltx (sketch → video) → save-preview
 *
 * LTX generates a low-quality 480p draft in 5–30s so users can verify
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
    const { sceneId, sketchDataUrl, motionPrompt } =
      event.data as PreviewGenerateEventData;

    // Step 1: Submit LTX job directly with the sketch.
    // No Flux uprender for drafts — sketch quality is fine for motion preview.
    const previewVideoUrl = await step.run("generate-ltx-draft", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "PREVIEWING" },
      });

      const requestId = await submitLtxJob(sketchDataUrl, motionPrompt);

      await prisma.scene.update({
        where: { id: sceneId },
        data: { ltxRequestId: requestId },
      });

      const videoUrl = await waitForLtxCompletion(requestId);
      return videoUrl;
    });

    // Step 2: Save the draft video URL and mark the scene preview-ready.
    await step.run("save-preview", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          previewVideoUrl,
          status: "PREVIEW_READY",
          ltxRequestId: null,
        },
      });
    });

    return { sceneId, previewVideoUrl };
  }
);
