"use client";

import { useMemo } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Upload,
  Sparkles,
  Film,
  PartyPopper,
  Mic,
  Fingerprint,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SceneStatus } from "@/lib/studio/status";

type StepState = "pending" | "active" | "complete" | "failed" | "skipped";

interface JobStatusBoardProps {
  status: SceneStatus;
  hasDialogue?: boolean;
  previewFrameReady?: boolean;
  stage?: "draft" | "final" | "idle"; // Phase 4
  className?: string;
}

// Maps SceneStatus to a numeric index for ordering comparisons
const STATUS_INDEX: Record<SceneStatus, number> = {
  PENDING: -1,
  UPLOADING: 0,
  // Draft stage
  PREVIEWING: 1,
  PREVIEW_READY: 2,
  PREVIEW_FAILED: 2,
  // Final stage
  UPRENDERING: 1,
  GENERATING_VIDEO: 2,
  COMPLETE: 3,
  FAILED: 3,
};

function resolveState(
  status: SceneStatus,
  stepActivatesAt: number,
  stepCompletesAt: number
): StepState {
  const idx = STATUS_INDEX[status];
  const isFailed = status === "FAILED";

  if (idx < stepActivatesAt) return "pending";
  if (idx === stepActivatesAt) {
    return isFailed ? "failed" : "active";
  }
  if (idx >= stepCompletesAt) {
    return isFailed && idx === stepCompletesAt ? "failed" : "complete";
  }
  return "complete";
}

function StepRow({
  icon,
  label,
  state,
  showConnector = true,
  indent = false,
}: {
  icon: React.ReactNode;
  label: string;
  state: StepState;
  showConnector?: boolean;
  indent?: boolean;
}) {
  return (
    <div className={cn(indent && "ml-5")}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300",
          {
            "bg-[var(--line)] text-[var(--text-muted)]": state === "pending",
            "bg-[var(--accent-light)] text-[var(--accent)] ring-1 ring-[var(--accent)]/20": state === "active",
            "bg-emerald-50 text-emerald-600": state === "complete",
            "bg-red-50 text-red-600": state === "failed",
            "bg-[var(--line)] text-[var(--text-muted)] opacity-60": state === "skipped",
          }
        )}
      >
        {/* Status indicator */}
        <div className="flex-shrink-0">
          {state === "active" && <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />}
          {state === "complete" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          {state === "failed" && <XCircle className="h-5 w-5 text-red-500" />}
          {(state === "pending" || state === "skipped") && (
            <Circle className="h-5 w-5 text-[var(--text-muted)]" />
          )}
        </div>

        {/* Step icon */}
        <div className="flex-shrink-0">{icon}</div>

        {/* Label */}
        <span
          className={cn("text-sm font-medium", {
            "text-[var(--text-muted)]": state === "pending" || state === "skipped",
            "text-[var(--accent)]": state === "active",
            "text-emerald-700": state === "complete",
            "text-red-700": state === "failed",
          })}
        >
          {label}
        </span>

        {/* Pulse dot for active step */}
        {state === "active" && (
          <span className="ml-auto flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[var(--accent)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
          </span>
        )}
      </div>

      {showConnector && (
        <div className="ml-6 flex h-4 items-center">
          <div
            className={cn("h-full w-px", {
              "bg-[var(--line-strong)]": state === "pending" || state === "skipped",
              "bg-emerald-300": state === "complete",
              "bg-[var(--accent)]/40": state === "active",
              "bg-red-300": state === "failed",
            })}
          />
        </div>
      )}
    </div>
  );
}

export function JobStatusBoard({
  status,
  hasDialogue = false,
  previewFrameReady = false,
  stage = "idle",
  className,
}: JobStatusBoardProps) {
  const isDraft = stage === "draft";
  const isFinal = stage === "final";

  const draftSteps = useMemo(() => {
    if (!isDraft) return null;
    const uploading: StepState = "complete";
    const previewFrame: StepState =
      status === "PREVIEWING" && !previewFrameReady ? "active"
      : previewFrameReady || status === "PREVIEW_READY" ? "complete"
      : status === "PREVIEW_FAILED" ? "failed"
      : "pending";
    const ready: StepState =
      status === "PREVIEW_READY" ? "complete"
      : status === "PREVIEW_FAILED" ? "failed"
      : "pending";
    return { uploading, previewFrame, ready };
  }, [status, isDraft, previewFrameReady]);

  const finalSteps = useMemo(() => {
    if (!isFinal) return null;
    const uprendering = resolveState(status, 1, 2);
    const synthVoice = hasDialogue ? resolveState(status, 1, 2) : ("skipped" as StepState);
    const createVoiceId = hasDialogue ? resolveState(status, 2, 2) : ("skipped" as StepState);
    const generatingVideo = resolveState(status, 2, 3);
    const complete: StepState = status === "COMPLETE" ? "complete" : "pending";
    return { uprendering, synthVoice, createVoiceId, generatingVideo, complete };
  }, [status, isFinal, hasDialogue]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── DRAFT TRACK ─────────────────────────────────────────────────── */}
      {isDraft && draftSteps && (
        <>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Preview Stage
            </h3>
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              ~10–20s
            </span>
          </div>
          <div className="space-y-0">
            <StepRow icon={<Upload className="h-4 w-4" />} label="Uploading assets" state={draftSteps.uploading} />
            <StepRow icon={<Sparkles className="h-4 w-4" />} label="Generating keyframe" state={draftSteps.previewFrame} />
            <StepRow icon={<PartyPopper className="h-4 w-4" />} label="Keyframe ready" state={draftSteps.ready} showConnector={false} />
          </div>
        </>
      )}

      {/* ── FINAL TRACK ─────────────────────────────────────────────────── */}
      {isFinal && finalSteps && (
        <>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Final Render
            </h3>
            <span className="rounded-full bg-[var(--accent-light)] border border-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
              Kling ~90s
            </span>
          </div>
          <div className="space-y-0">
            <StepRow
              icon={<Sparkles className="h-4 w-4" />}
              label="Uprendering sketch"
              state={finalSteps.uprendering}
            />

            {hasDialogue ? (
              <>
                <div className="ml-6 flex h-4 items-center gap-2">
                  <div className={cn("h-full w-px", finalSteps.uprendering === "complete" ? "bg-emerald-300" : "bg-[var(--line-strong)]")} />
                  <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] font-medium uppercase tracking-wider">
                    <GitBranch className="h-2.5 w-2.5" />
                    parallel
                  </div>
                </div>
                <div className="ml-4 space-y-1 border-l-2 border-[var(--line-strong)] pl-3">
                  <StepRow icon={<Mic className="h-4 w-4" />} label="Synthesizing voice" state={finalSteps.synthVoice} showConnector={false} />
                </div>
                <div className="ml-6 h-4 flex items-center">
                  <div className={cn("h-full w-px", finalSteps.synthVoice === "complete" ? "bg-emerald-300" : "bg-[var(--line-strong)]")} />
                </div>
                <StepRow icon={<Fingerprint className="h-4 w-4" />} label="Creating voice ID" state={finalSteps.createVoiceId} />
              </>
            ) : null}

            <StepRow icon={<Film className="h-4 w-4" />} label="Generating video" state={finalSteps.generatingVideo} />
            <StepRow icon={<PartyPopper className="h-4 w-4" />} label="Complete" state={finalSteps.complete} showConnector={false} />
          </div>
        </>
      )}
    </div>
  );
}
