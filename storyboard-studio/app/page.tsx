"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2, ArrowRight, ImageIcon, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { DropZone } from "@/components/drop-zone/DropZone";
import { uploadFileToFalStorage } from "@/lib/fal/storage";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProjectListItem = RouterOutputs["project"]["listProjects"][number];

export default function HomePage() {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const projectsQuery = trpc.project.listProjects.useQuery();
  const createProjectMutation = trpc.project.createProject.useMutation();

  const handleImageReady = useCallback(
    async (file: File, localPreviewUrl: string) => {
      setPreviewSrc(localPreviewUrl);
      setLaunching(true);
      try {
        const [imageUrl, project] = await Promise.all([
          uploadFileToFalStorage(file),
          createProjectMutation.mutateAsync({
            title: `Project ${new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          }),
        ]);
        router.push(`/studio/${project.id}?seed=${encodeURIComponent(imageUrl)}`);
      } catch (err) {
        console.error("Failed to launch studio:", err);
        setLaunching(false);
        setPreviewSrc(null);
      }
    },
    [createProjectMutation, router]
  );

  const totalScenes = projectsQuery.data?.reduce((s, p) => s + p._count.scenes, 0) ?? 0;

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-10">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            Storyboard Studio
          </span>
        </div>
        <div className="flex items-center gap-5 text-sm text-[var(--text-muted)]">
          <span>{projectsQuery.data?.length ?? 0} projects</span>
          <span>{totalScenes} scenes</span>
        </div>
      </nav>

      {/* Hero */}
      <main className="mx-auto max-w-5xl px-6 pb-20 pt-10 md:px-10">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Powered by Flux Kontext + Kling O3 Pro
          </div>
          <h1 className="font-display text-6xl font-semibold leading-[0.95] text-[var(--text-primary)] md:text-8xl">
            One photo.
            <br />
            <span className="text-[var(--accent)]">Your scene.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-secondary)]">
            Drop any image, pick a cinematic shot type, and get a photorealistic
            frame in 15 seconds. Chain scenes into a film strip.
          </p>
        </div>

        {/* Drop zone */}
        <div className="mx-auto max-w-2xl">
          <DropZone
            onImageReady={handleImageReady}
            currentImage={previewSrc}
            uploading={launching}
            className="min-h-[280px]"
          />
          {launching && (
            <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
              Uploading and opening studio…
            </p>
          )}
          {!launching && (
            <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
              JPG, PNG, WEBP · Your image is auto-resized and uploaded to secure storage
            </p>
          )}
        </div>

        {/* Feature tiles */}
        <div className="mt-14 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: "⚡",
              title: "15s frame preview",
              body: "Flux Kontext generates a photorealistic start frame. See the result before committing to a full video render.",
            },
            {
              icon: "🎬",
              title: "Character continuity",
              body: "Upload reference photos once. Every scene in the project keeps your character's identity locked.",
            },
            {
              icon: "🎞",
              title: "Film strip sequencer",
              body: "All your scenes live in a timeline. Build shot by shot, then render selectively.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm"
            >
              <span className="text-2xl">{f.icon}</span>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{f.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{f.body}</p>
            </div>
          ))}
        </div>

        {/* Recent projects */}
        {(projectsQuery.data?.length ?? 0) > 0 && (
          <div className="mt-14">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Recent Projects</h2>
              <span className="text-sm text-[var(--text-muted)]">Click to continue</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projectsQuery.data?.map((project: ProjectListItem) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => router.push(`/studio/${project.id}`)}
                  className="group flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)]/30 hover:shadow-md"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {project.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Clock className="h-3 w-3" />
                      {project._count.scenes} scene{project._count.scenes !== 1 ? "s" : ""}
                      &nbsp;·&nbsp;
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--accent)]" />
                </button>
              ))}
            </div>
          </div>
        )}

        {projectsQuery.isLoading && (
          <div className="mt-14 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        )}
      </main>
    </div>
  );
}
