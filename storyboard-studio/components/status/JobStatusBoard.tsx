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

type SceneStatus =
  | "PENDING"
  | "UPLOADING"
  | "UPRENDERING"
  | "GENERATING_VIDEO"
  | "COMPLETE"
  | "FAILED";

type StepState = "pending" | "active" | "complete" | "failed" | "skipped";

interface JobStatusBoardProps {
  status: SceneStatus;
  hasDialogue?: boolean; // controls voice step visibility
  className?: string;
}

// Maps SceneStatus to a numeric index for ordering comparisons
const STATUS_INDEX: Record<SceneStatus, number> = {
  PENDING: -1,
  UPLOADING: 0,
  UPRENDERING: 1,
  GENERATING_VIDEO: 2,
  COMPLETE: 3,
  FAILED: 3,
};

function resolveState(
  status: SceneStatus,
  stepActivatesAt: number,    // STATUS_INDEX value when this step becomes active
  stepCompletesAt: number     // STATUS_INDEX value when this step is done
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
            "bg-gray-800/50 text-gray-500": state === "pending",
            "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30": state === "active",
            "bg-emerald-500/10 text-emerald-400": state === "complete",
            "bg-red-500/10 text-red-400": state === "failed",
            "bg-gray-800/30 text-gray-600": state === "skipped",
          }
        )}
      >
        {/* Status indicator */}
        <div className="flex-shrink-0">
          {state === "active" && <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />}
          {state === "complete" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          {state === "failed" && <XCircle className="h-5 w-5 text-red-400" />}
          {(state === "pending" || state === "skipped") && (
            <Circle className="h-5 w-5 text-gray-600" />
          )}
        </div>

        {/* Step icon */}
        <div className="flex-shrink-0">{icon}</div>

        {/* Label */}
        <span
          className={cn("text-sm font-medium", {
            "text-gray-500": state === "pending",
            "text-indigo-200": state === "active",
            "text-emerald-300": state === "complete",
            "text-red-300": state === "failed",
            "text-gray-600": state === "skipped",
          })}
        >
          {label}
        </span>

        {/* Pulse dot for active step */}
        {state === "active" && (
          <span className="ml-auto flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
          </span>
        )}
      </div>

      {showConnector && (
        <div className="ml-6 flex h-4 items-center">
          <div
            className={cn("h-full w-px", {
              "bg-gray-700": state === "pending" || state === "skipped",
              "bg-emerald-500/40": state === "complete",
              "bg-indigo-500/40": state === "active",
              "bg-red-500/40": state === "failed",
            })}
          />
        </div>
      )}
    </div>
  );
}

export function JobStatusBoard({ status, hasDialogue = false, className }: JobStatusBoardProps) {
  const steps = useMemo(() => {
    // Derive state for each logical step based on scene status
    const uploading = resolveState(status, 0, 1);

    // Uprendering and voice synthesis run in parallel (both during UPRENDERING status)
    const uprendering = resolveState(status, 1, 2);
    const synthVoice = hasDialogue ? resolveState(status, 1, 2) : ("skipped" as StepState);
    const createVoiceId = hasDialogue ? resolveState(status, 2, 2) : ("skipped" as StepState);

    const generatingVideo = resolveState(status, 2, 3);
    const complete = status === "COMPLETE" ? ("complete" as StepState) : ("pending" as StepState);

    return { uploading, uprendering, synthVoice, createVoiceId, generatingVideo, complete };
  }, [status, hasDialogue]);

  const showVoiceSteps = hasDialogue;

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Pipeline Status
      </h3>

      <div className="space-y-0">
        <StepRow
          icon={<Upload className="h-4 w-4" />}
          label="Uploading assets"
          state={steps.uploading}
        />

        {/* Parallel group: Uprendering + Voice Synthesis */}
        {showVoiceSteps ? (
          <>
            {/* Parallel group indicator */}
            <div className="ml-6 flex h-4 items-center gap-2">
              <div className={cn("h-full w-px", steps.uploading === "complete" ? "bg-emerald-500/40" : "bg-gray-700")} />
              <div className="flex items-center gap-1 text-[9px] text-gray-600 font-medium uppercase tracking-wider">
                <GitBranch className="h-2.5 w-2.5" />
                parallel
              </div>
            </div>
            <div className="ml-4 space-y-1 border-l-2 border-gray-700/60 pl-3">
              <StepRow
                icon={<Sparkles className="h-4 w-4" />}
                label="Uprendering sketch"
                state={steps.uprendering}
                showConnector={false}
              />
              <StepRow
                icon={<Mic className="h-4 w-4" />}
                label="Synthesizing voice"
                state={steps.synthVoice}
                showConnector={false}
              />
            </div>
            <div className="ml-6 h-4 flex items-center">
              <div className={cn("h-full w-px", steps.uprendering === "complete" ? "bg-emerald-500/40" : "bg-gray-700")} />
            </div>
            <StepRow
              icon={<Fingerprint className="h-4 w-4" />}
              label="Creating voice ID"
              state={steps.createVoiceId}
            />
          </>
        ) : (
          <StepRow
            icon={<Sparkles className="h-4 w-4" />}
            label="Uprendering sketch"
            state={steps.uprendering}
          />
        )}

        <StepRow
          icon={<Film className="h-4 w-4" />}
          label="Generating video"
          state={steps.generatingVideo}
        />
        <StepRow
          icon={<PartyPopper className="h-4 w-4" />}
          label="Complete"
          state={steps.complete}
          showConnector={false}
        />
      </div>
    </div>
  );
}
