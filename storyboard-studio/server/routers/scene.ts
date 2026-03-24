import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { getJobState } from "@/lib/redis";
import { getMediaProvider } from "@/lib/media/provider";

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
        dialogue: z.string().max(500).optional(), // Phase 3: character dialogue
      })
    )
    .mutation(async ({ input }) => {
      // Fetch project to get the voice sample URL for the Inngest event
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { voiceSampleUrl: true },
      });

      const scene = await prisma.scene.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          motionPrompt: input.motionPrompt,
          sketchDataUrl: input.sketchDataUrl,
          dialogue: input.dialogue ?? null,
          status: "PENDING",
        },
      });

      await inngest.send({
        name: "studio/scene.generate",
        data: {
          sceneId: scene.id,
          sketchDataUrl: input.sketchDataUrl,
          motionPrompt: input.motionPrompt,
          projectId: input.projectId,
          dialogue: input.dialogue,
          voiceSampleUrl: project?.voiceSampleUrl ?? undefined,
        },
      });

      return { sceneId: scene.id };
    }),

  /**
   * Submit a scene for draft preview generation via LTX-Video.
   * Fast path — fires the preview workflow, not the Kling workflow.
   * The preview first creates a fast photoreal frame, then animates that
   * frame into a short draft so users can judge realism before final render.
   */
  submitPreview: publicProcedure
    .input(
      z.object({
        projectId: z.string().cuid(),
        title: z.string().min(1, "Scene title is required").max(200),
        motionPrompt: z.string().min(1, "Motion prompt is required").max(2000),
        sketchDataUrl: z.string().min(1, "Sketch is required"),
        dialogue: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const scene = await prisma.scene.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          motionPrompt: input.motionPrompt,
          sketchDataUrl: input.sketchDataUrl,
          dialogue: input.dialogue ?? null,
          status: "PENDING",
        },
      });

      await inngest.send({
        name: "studio/preview.generate",
        data: {
          sceneId: scene.id,
          sketchDataUrl: input.sketchDataUrl,
          motionPrompt: input.motionPrompt,
          projectId: input.projectId,
        },
      });

      return { sceneId: scene.id };
    }),

  /**
   * Approve a draft preview for final Kling render.
   * Idempotent — safe to call multiple times (second call is a no-op).
   * Reuses any existing uprenderUrl when available; otherwise Flux runs here.
   */
  approveForRender: publicProcedure
    .input(z.object({ sceneId: z.string().cuid() }))
    .mutation(async ({ input }) => {
      const scene = await prisma.scene.findUnique({
        where: { id: input.sceneId },
        select: {
          id: true,
          projectId: true,
          status: true,
          renderApprovedAt: true,
          sketchDataUrl: true,
          motionPrompt: true,
          dialogue: true,
        },
      });

      if (!scene) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scene not found" });
      }

      // Idempotency guard — if already approved, return silently
      if (scene.renderApprovedAt) {
        return { sceneId: scene.id };
      }

      if (scene.status !== "PREVIEW_READY" && scene.status !== "PREVIEW_FAILED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve scene with status ${scene.status}. Must be PREVIEW_READY or PREVIEW_FAILED.`,
        });
      }

      // Fetch project voice sample for the Kling workflow
      const project = await prisma.project.findUnique({
        where: { id: scene.projectId },
        select: { voiceSampleUrl: true },
      });

      // Mark as approved and move to final render stage
      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          renderApprovedAt: new Date(),
          status: "UPRENDERING",
        },
      });

      // Fire the same Kling workflow as submitScene.
      // generate-scene.ts reuses an existing uprenderUrl when present and
      // only calls Flux when the scene still needs a prepared start frame.
      await inngest.send({
        name: "studio/scene.generate",
        data: {
          sceneId: scene.id,
          sketchDataUrl: scene.sketchDataUrl ?? "",
          motionPrompt: scene.motionPrompt,
          projectId: scene.projectId,
          dialogue: scene.dialogue ?? undefined,
          voiceSampleUrl: project?.voiceSampleUrl ?? undefined,
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
          dialogue: true,
          previewVideoUrl: true,
          renderApprovedAt: true,
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
      const media = getMediaProvider();

      // Fire cancel event to Inngest
      await inngest.send({
        name: "studio/scene.cancel",
        data: { sceneId: input.sceneId },
      });

      // Try to cancel the Kling job in fal if it's running
      const jobState = await getJobState(input.sceneId);
      if (jobState?.klingRequestId && media.cancelFinalVideo) {
        try {
          await media.cancelFinalVideo(jobState.klingRequestId);
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
   * Delete a scene.
   */
  deleteScene: publicProcedure
    .input(z.object({ sceneId: z.string().cuid() }))
    .mutation(async ({ input }) => {
      const media = getMediaProvider();

      // Cancel any running Inngest workflow
      await inngest.send({
        name: "studio/scene.cancel",
        data: { sceneId: input.sceneId },
      });

      // Try to cancel any active fal job
      const jobState = await getJobState(input.sceneId);
      if (jobState?.klingRequestId && media.cancelFinalVideo) {
        try {
          await media.cancelFinalVideo(jobState.klingRequestId);
        } catch {
          // Ignore — job may already be done
        }
      }

      await prisma.scene.delete({
        where: { id: input.sceneId },
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
