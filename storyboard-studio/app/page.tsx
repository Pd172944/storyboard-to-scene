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

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <Film className="h-10 w-10 text-indigo-500" />
          <h1 className="text-4xl font-bold tracking-tight text-gray-100">
            Storyboard Studio
          </h1>
        </div>
        <p className="text-lg text-gray-400">
          Draw storyboard panels, describe scenes, and generate AI video clips.
        </p>
      </div>

      {/* Create project */}
      <Card className="mb-10">
        <CardContent className="flex items-center gap-3 p-6">
          <Input
            placeholder="New project title…"
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateProject();
            }}
            className="flex-1"
            disabled={isCreating}
          />
          <Button
            onClick={handleCreateProject}
            disabled={isCreating || !newProjectTitle.trim()}
          >
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Project
          </Button>
        </CardContent>
      </Card>

      {/* Project list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-300">Your Projects</h2>

        {projectsQuery.isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        )}

        {projectsQuery.data?.length === 0 && (
          <div className="py-12 text-center">
            <Folder className="mx-auto mb-3 h-12 w-12 text-gray-700" />
            <p className="text-gray-500">
              No projects yet. Create one above to get started.
            </p>
          </div>
        )}

        {projectsQuery.data?.map((project: ProjectListItem) => (
          <Card
            key={project.id}
            className="cursor-pointer transition-colors hover:border-indigo-500/50 hover:bg-gray-800/80"
            onClick={() => router.push(`/studio/${project.id}`)}
          >
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <h3 className="font-medium text-gray-100">{project.title}</h3>
                <p className="text-sm text-gray-500">
                  {project._count.scenes} scene
                  {project._count.scenes !== 1 ? "s" : ""} •{" "}
                  {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Film className="h-5 w-5 text-gray-600" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
