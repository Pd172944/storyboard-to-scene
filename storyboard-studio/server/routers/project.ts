import { z } from "zod";
import { router, publicProcedure } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";
import { invalidateCharacterReelCache } from "@/lib/redis";

const FAL_URL_PATTERN = /^https:\/\/.*fal\.(media|ai)\//;

export const projectRouter = router({
  /**
   * Create a new project.
   */
  createProject: publicProcedure
    .input(
      z.object({
        title: z.string().min(1, "Project title is required").max(200),
      })
    )
    .mutation(async ({ input }) => {
      const project = await prisma.project.create({
        data: { title: input.title },
      });
      return project;
    }),

  /**
   * Get a single project by ID with its scenes.
   */
  getProject: publicProcedure
    .input(z.object({ projectId: z.string().cuid() }))
    .query(async ({ input }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        include: {
          scenes: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!project) {
        throw new Error(`Project ${input.projectId} not found`);
      }

      return project;
    }),

  /**
   * List all projects, most recent first.
   */
  listProjects: publicProcedure.query(async () => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { scenes: true } },
      },
    });
    return projects;
  }),

  /**
   * Set character reference images for a project.
   * Invalidates any existing reel so the next scene regenerates it.
   */
  setCharacterRefs: publicProcedure
    .input(
      z.object({
        projectId: z.string().cuid(),
        referenceImageUrls: z
          .array(z.string().url())
          .min(1, "At least one reference image is required")
          .max(3, "Maximum 3 reference images allowed")
          .refine(
            (urls) =>
              urls.every((url) => FAL_URL_PATTERN.test(url)),
            "All URLs must be fal.media storage URLs"
          ),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Update Project.characterRefUrls and reset reel state
      await prisma.project.update({
        where: { id: input.projectId },
        data: {
          characterRefUrls: input.referenceImageUrls,
          characterReelStatus: "PENDING",
          characterReelUrl: null,
          wanRequestId: null,
        },
      });

      // 2. Invalidate Redis cache so next scene submission regenerates
      await invalidateCharacterReelCache(input.projectId);

      return { success: true };
    }),

  /**
   * Get current character reel status for a project.
   */
  getCharacterReelStatus: publicProcedure
    .input(z.object({ projectId: z.string().cuid() }))
    .query(async ({ input }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: {
          characterReelStatus: true,
          characterReelUrl: true,
          characterRefUrls: true,
        },
      });

      if (!project) {
        throw new Error(`Project ${input.projectId} not found`);
      }

      return {
        status: project.characterReelStatus,
        reelUrl: project.characterReelUrl,
        refImageUrls: project.characterRefUrls,
      };
    }),
});
