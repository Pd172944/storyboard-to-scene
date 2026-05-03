import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { router, publicProcedure } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";

export const shareRouter = router({
  /**
   * Generate (or return existing) share token for a scene.
   * Only scenes that are PREVIEW_READY or COMPLETE can be shared.
   */
  createShareLink: publicProcedure
    .input(z.object({ sceneId: z.string().cuid() }))
    .mutation(async ({ input }) => {
      const scene = await prisma.scene.findUnique({
        where: { id: input.sceneId },
        select: { id: true, status: true, shareToken: true },
      });

      if (!scene) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scene not found" });
      }

      if (scene.status !== "PREVIEW_READY" && scene.status !== "COMPLETE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Scene must be PREVIEW_READY or COMPLETE to share",
        });
      }

      // Idempotent — return existing token if already created
      if (scene.shareToken) {
        return { shareToken: scene.shareToken };
      }

      const shareToken = randomBytes(10).toString("hex");
      await prisma.scene.update({
        where: { id: scene.id },
        data: { shareToken },
      });

      return { shareToken };
    }),

  /**
   * Get a scene by its public share token.
   * Returns only publicly safe fields (no project info).
   */
  getByShareToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const scene = await prisma.scene.findUnique({
        where: { shareToken: input.token },
        select: {
          id: true,
          title: true,
          motionPrompt: true,
          status: true,
          uprenderUrl: true,
          videoUrl: true,
          previewVideoUrl: true,
          createdAt: true,
        },
      });

      if (!scene) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found or expired" });
      }

      return scene;
    }),
});
