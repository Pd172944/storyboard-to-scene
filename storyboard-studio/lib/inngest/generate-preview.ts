import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import { getMediaProvider } from "@/lib/media/provider";

interface PreviewGenerateEventData {
  sceneId: string;
  sketchDataUrl: string; // fal storage URL (uploaded client-side)
  motionPrompt: string;
  projectId: string;
}

/**
 * Draft preview workflow.
 *
 * Generates a photoreal preview frame first, then animates it into a short
 * draft video. This keeps the preview path fast enough for iteration while
 * avoiding the low-quality animated look of sketch-to-video directly.
 *
 * Pipeline: fast preview frame -> submit-ltx(frame) -> save-preview
 */
export const generatePreview = inngest.createFunction(
  {
    id: "generate-preview",
    retries: 1, // drafts should be fast or fail fast
    cancelOn: [{ event: "studio/scene.cancel", match: "data.sceneId" }],
    onFailure: async ({ event, error }) => {
      const { sceneId } = event.data.event.data as PreviewGenerateEventData;
      console.error(`[generate-preview] Failed for scene ${sceneId}:`, error);
      await prisma.scene.update({
        where: { id: sceneId },
        data: { status: "PREVIEW_FAILED", ltxRequestId: null },
      });
    },
  },
  { event: "studio/preview.generate" },
  async ({ event, step }) => {
    const { sceneId, sketchDataUrl, motionPrompt, projectId } =
      event.data as PreviewGenerateEventData;
    const media = getMediaProvider();

    const characterRefUrls = await step.run("fetch-character-refs", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { characterRefUrls: true },
      });
      return project?.characterRefUrls ?? [];
    });

    const primaryRef = characterRefUrls.length > 0 ? characterRefUrls[0] : undefined;

    await step.run("mark-previewing", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          status: "PREVIEWING",
          referenceImageUrl: null,
          previewVideoUrl: null,
          ltxRequestId: null,
          uprenderUrl: null,
        },
      });
    });

    // Step 1: Build a high-quality photoreal preview frame first.
    const previewFrameUrl = await step.run("generate-preview-frame", async () => {
      const imageUrl = await media.generatePreviewFrame({
        sketchUrl: sketchDataUrl,
        motionPrompt,
        characterRefUrl: primaryRef,
      });

      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          referenceImageUrl: imageUrl,
          uprenderUrl: imageUrl,
        },
      });

      return imageUrl;
    });

    // Step 2: Animate the preview frame into a short video draft.
    const previewVideoUrl = await step.run("animate-preview-frame", async () => {
      const job = await media.submitDraftVideo({
        imageUrl: previewFrameUrl,
        motionPrompt,
      });

      await prisma.scene.update({
        where: { id: sceneId },
        data: { ltxRequestId: job.requestId ?? null },
      });

      const videoUrl = await media.waitForDraftVideo(job);
      return videoUrl;
    });

    // Step 3: Save the draft video URL and mark the scene preview-ready.
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
