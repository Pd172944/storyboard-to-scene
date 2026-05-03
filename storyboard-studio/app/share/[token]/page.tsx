import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Film, ArrowRight, Play } from "lucide-react";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

async function getSharedScene(token: string) {
  const scene = await prisma.scene.findUnique({
    where: { shareToken: token },
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
  return scene;
}

export async function generateMetadata({ params }: SharePageProps) {
  const { token } = await params;
  const scene = await getSharedScene(token);

  if (!scene) {
    return { title: "Scene not found" };
  }

  return {
    title: `${scene.title} · Framesmith`,
    description: scene.motionPrompt,
    openGraph: {
      title: scene.title,
      description: scene.motionPrompt,
      images: scene.uprenderUrl ? [{ url: scene.uprenderUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: scene.title,
      description: scene.motionPrompt,
      images: scene.uprenderUrl ? [scene.uprenderUrl] : [],
    },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const scene = await getSharedScene(token);

  if (!scene) notFound();

  const videoSrc = scene.videoUrl ?? scene.previewVideoUrl;
  const isComplete = scene.status === "COMPLETE";

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Header */}
      <header className="mx-4 mt-4 flex items-center justify-between rounded-[24px] border border-white/10 bg-black/40 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Framesmith</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-1.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
        >
          Make your own
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl space-y-6">
          {/* Title + status */}
          <div className="text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-[var(--text-muted)]">
              {isComplete ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Final render
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Draft preview
                </>
              )}
            </div>
            <h1 className="font-display text-4xl font-semibold text-[var(--text-primary)] md:text-5xl">
              {scene.title}
            </h1>
            <p className="mt-3 max-w-2xl mx-auto text-base text-[var(--text-secondary)] leading-relaxed">
              {scene.motionPrompt}
            </p>
          </div>

          {/* Video / Frame */}
          <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black shadow-2xl">
            {videoSrc ? (
              <video
                src={videoSrc}
                autoPlay
                loop
                muted
                playsInline
                className="w-full"
                poster={scene.uprenderUrl ?? undefined}
              />
            ) : scene.uprenderUrl ? (
              <img
                src={scene.uprenderUrl}
                alt={scene.title}
                className="w-full"
              />
            ) : (
              <div className="aspect-video flex items-center justify-center bg-gray-900">
                <div className="text-center space-y-2">
                  <Play className="h-12 w-12 mx-auto text-gray-700" />
                  <p className="text-sm text-gray-600">Video not yet available</p>
                </div>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              Turn your photos into cinematic scenes
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Drop a photo, pick a shot type, generate in seconds. No prompt engineering required.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-bold text-black transition hover:opacity-90"
            >
              Try Framesmith
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="text-center text-xs text-[var(--text-muted)]">
            Generated {new Date(scene.createdAt).toLocaleDateString()} · Framesmith
          </p>
        </div>
      </main>
    </div>
  );
}
