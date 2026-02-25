import { z } from "zod";
import { router, publicProcedure } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";

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
});
