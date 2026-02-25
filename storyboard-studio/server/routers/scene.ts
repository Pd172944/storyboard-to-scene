import { z } from "zod";
import { router, publicProcedure } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { getJobState } from "@/lib/redis";
import { fal } from "@/lib/fal/client";

const KLING_MODEL_ID = "fal-ai/kling-video/v2.6/pro/image-to-video";

export const sceneRouter = router({
  /**
   * Submit a new scene for generation.
   * Creates a Scene record and fires the Inngest workflow.
   */
  submitScene: publicProcedure
    .input(
      z.object({
        projectId: z.string().cuid(),
        title: z.string().min(1, "Scene title is required").max(200),
        motionPrompt: z.string().min(1, "Motion prompt is required").max(2000),
        sketchDataUrl: z.string().min(1, "Sketch is required"),
        referenceImageUrl: z.string().url("Invalid reference image URL"),
      })
    )
    .mutation(async ({ input }) => {
      const scene = await prisma.scene.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          motionPrompt: input.motionPrompt,
          sketchDataUrl: input.sketchDataUrl,
          referenceImageUrl: input.referenceImageUrl,
          status: "PENDING",
        },
      });

      await inngest.send({
        name: "studio/scene.generate",
        data: {
          sceneId: scene.id,
          sketchDataUrl: input.sketchDataUrl,
          referenceImageUrl: input.referenceImageUrl,
          motionPrompt: input.motionPrompt,
          projectId: input.projectId,
        },
      });

      return { sceneId: scene.id };
    }),

  /**
   * Get the current status of a scene (polled by the client every 3s).
   */
  getSceneStatus: publicProcedure
    .input(z.object({ sceneId: z.string().cuid() }))
    .query(async ({ input }) => {
      const scene = await prisma.scene.findUnique({
        where: { id: input.sceneId },
        select: {
          id: true,
          title: true,
          status: true,
          uprenderUrl: true,
          videoUrl: true,
          referenceImageUrl: true,
          motionPrompt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!scene) {
        throw new Error(`Scene ${input.sceneId} not found`);
      }

      return scene;
    }),

  /**
   * Cancel a running scene generation.
   */
  cancelScene: publicProcedure
    .input(z.object({ sceneId: z.string().cuid() }))
    .mutation(async ({ input }) => {
      // Fire cancel event to Inngest
      await inngest.send({
        name: "studio/scene.cancel",
        data: { sceneId: input.sceneId },
      });

      // Try to cancel the Kling job in fal if it's running
      const jobState = await getJobState(input.sceneId);
      if (jobState?.klingRequestId) {
        try {
          await fal.queue.cancel(KLING_MODEL_ID, {
            requestId: jobState.klingRequestId,
          });
        } catch {
          // Ignore cancel errors — the job may already be complete
        }
      }

      await prisma.scene.update({
        where: { id: input.sceneId },
        data: { status: "FAILED" },
      });

      return { success: true };
    }),

  /**
   * List all scenes for a project.
   */
  listScenes: publicProcedure
    .input(z.object({ projectId: z.string().cuid() }))
    .query(async ({ input }) => {
      const scenes = await prisma.scene.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          uprenderUrl: true,
          videoUrl: true,
          createdAt: true,
        },
      });
      return scenes;
    }),
});
