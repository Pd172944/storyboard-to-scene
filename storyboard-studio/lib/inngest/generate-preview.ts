import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/db";
import { getMediaProvider } from "@/lib/media/provider";

interface PreviewGenerateEventData {
  sceneId: string;
  sketchDataUrl: string;
  motionPrompt: string;
  projectId: string;
}

export const generatePreview = inngest.createFunction(
  {
    id: "generate-preview",
    retries: 1,
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

    // Step 1: Fetch character refs and mark the scene as in-progress in one round-trip.
    const { characterRefUrls } = await step.run("fetch-and-initialize", async () => {
      const [project] = await Promise.all([
        prisma.project.findUnique({
          where: { id: projectId },
          select: { characterRefUrls: true },
        }),
        prisma.scene.update({
          where: { id: sceneId },
          data: {
            status: "PREVIEWING",
            referenceImageUrl: null,
            previewVideoUrl: null,
            ltxRequestId: null,
            uprenderUrl: null,
          },
        }),
      ]);
      return { characterRefUrls: project?.characterRefUrls ?? [] };
    });

    const primaryRef = characterRefUrls.length > 0 ? characterRefUrls[0] : undefined;

    // Step 2: Run Flux, write all results, and mark PREVIEW_READY — one round-trip.
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
          previewVideoUrl: null,
          status: "PREVIEW_READY",
          ltxRequestId: null,
        },
      });

      return imageUrl;
    });

    return { sceneId, previewFrameUrl };
  }
);
