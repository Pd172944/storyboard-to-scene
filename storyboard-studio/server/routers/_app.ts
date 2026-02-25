import { router } from "@/lib/trpc/server";
import { projectRouter } from "@/server/routers/project";
import { sceneRouter } from "@/server/routers/scene";

export const appRouter = router({
  project: projectRouter,
  scene: sceneRouter,
});

export type AppRouter = typeof appRouter;
