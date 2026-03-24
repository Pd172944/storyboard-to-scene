"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Film, Folder, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProjectListItem = RouterOutputs["project"]["listProjects"][number];
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  const router = useRouter();
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const projectsQuery = trpc.project.listProjects.useQuery();
  const createProjectMutation = trpc.project.createProject.useMutation();

  const handleCreateProject = useCallback(async () => {
    const title = newProjectTitle.trim();
    if (!title) return;

    setIsCreating(true);
    try {
      const project = await createProjectMutation.mutateAsync({ title });
      router.push(`/studio/${project.id}`);
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsCreating(false);
    }
  }, [newProjectTitle, createProjectMutation, router]);

  const projectCount = projectsQuery.data?.length ?? 0;
  const totalScenes =
    projectsQuery.data?.reduce((sum, project) => sum + project._count.scenes, 0) ?? 0;
  const latestProject = projectsQuery.data?.[0];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
      <section className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="surface-panel-strong overflow-hidden rounded-[36px] p-8 md:p-10">
          <div className="eyebrow mb-4">FAL Native Storyboarding</div>
          <div className="max-w-3xl">
            <h1 className="font-display text-5xl leading-[0.92] text-[var(--text-primary)] md:text-7xl">
              Sketch ideas.
              <br />
              Lock identity.
              <br />
              Pitch motion.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--text-secondary)] md:text-lg">
              Storyboard Studio is a cinematic previsualization workspace for rapid scene ideation.
              Draw the frame, anchor the character, preview the motion, then push the best take into a full render.
            </p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <Card className="rounded-[24px] border-white/10 bg-white/[0.04] shadow-none">
              <CardContent className="p-5">
                <p className="eyebrow">Projects</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  {projectCount}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  active story worlds
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-[24px] border-white/10 bg-white/[0.04] shadow-none">
              <CardContent className="p-5">
                <p className="eyebrow">Scenes</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  {totalScenes}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  clips explored
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-[24px] border-white/10 bg-white/[0.04] shadow-none">
              <CardContent className="p-5">
                <p className="eyebrow">Latest</p>
                <p className="mt-3 truncate text-lg font-semibold text-[var(--text-primary)]">
                  {latestProject?.title ?? "None yet"}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  newest board in motion
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {[
              {
                title: "Preview-first pipeline",
                body: "Generate a photoreal frame before you spend on full motion.",
              },
              {
                title: "Identity-aware scenes",
                body: "Character references and voice assets stay attached to the project.",
              },
              {
                title: "Render-provider ready",
                body: "FAL today, Runpod tomorrow, without rewriting the workflow layer.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[24px] border border-white/10 bg-black/20 p-5"
              >
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <Card className="surface-panel-strong rounded-[32px]">
          <CardContent className="p-7">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                <Plus className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div>
                <p className="eyebrow">Start A New Board</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
                  Create a production-ready concept
                </h2>
              </div>
            </div>

            <div className="space-y-3">
              <Input
                placeholder="Project title..."
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateProject();
                }}
                disabled={isCreating}
              />
              <Button
                onClick={handleCreateProject}
                disabled={isCreating || !newProjectTitle.trim()}
                className="w-full"
                size="lg"
              >
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create Project
              </Button>
            </div>

            <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-4">
              <p className="eyebrow">Workflow</p>
              <div className="mt-3 space-y-3">
                {[
                  "Sketch the composition on the board",
                  "Attach character reference images and optional voice",
                  "Preview a photoreal frame and motion draft before final render",
                ].map((step, index) => (
                  <div key={step} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-xs text-[var(--accent)]">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              Recent Projects
            </h2>
          </div>
          <span className="text-sm text-[var(--text-muted)]">
            Jump back into your strongest boards
          </span>
        </div>

        {projectsQuery.isLoading && (
          <div className="surface-panel flex items-center justify-center rounded-[28px] py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {projectsQuery.data?.length === 0 && (
          <Card className="surface-panel rounded-[28px]">
            <CardContent className="py-16 text-center">
              <Folder className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
              <p className="font-medium text-[var(--text-primary)]">
                No projects yet
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Start one above to build your first cinematic board.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projectsQuery.data?.map((project: ProjectListItem) => (
            <Card
              key={project.id}
              className="group cursor-pointer rounded-[28px] transition duration-200 hover:-translate-y-1 hover:border-[rgba(210,255,114,0.28)] hover:bg-white/[0.04]"
              onClick={() => router.push(`/studio/${project.id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Project</p>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                      {project.title}
                    </h3>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 transition group-hover:border-[rgba(210,255,114,0.28)]">
                    <Film className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                </div>

                <div className="mt-8 flex items-end justify-between">
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">
                      {project._count.scenes} scene{project._count.scenes !== 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">
                    Open board
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
