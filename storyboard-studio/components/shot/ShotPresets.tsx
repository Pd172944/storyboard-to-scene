"use client";

import { cn } from "@/lib/utils";

export interface ShotPreset {
  id: string;
  label: string;
  sublabel: string;
  emoji: string;
  prompt: string;
}

export const SHOT_PRESETS: ShotPreset[] = [
  {
    id: "wide",
    label: "Wide Shot",
    sublabel: "Establish the world",
    emoji: "🌅",
    prompt:
      "Wide establishing shot with architectural depth and environmental context. Slow cinematic push-in. Golden-hour warmth with realistic shadows.",
  },
  {
    id: "closeup",
    label: "Close-Up",
    sublabel: "Lock on the face",
    emoji: "👁️",
    prompt:
      "Tight close-up with shallow depth of field, subject locks eye contact. Subtle breathing and micro-expressions visible. Soft, diffused lighting.",
  },
  {
    id: "tracking",
    label: "Tracking Shot",
    sublabel: "Follow the action",
    emoji: "🎯",
    prompt:
      "Side tracking shot as the subject moves through the environment. Camera follows at shoulder height with a slight handheld feel. Natural motion blur.",
  },
  {
    id: "overhead",
    label: "Overhead",
    sublabel: "Bird's eye reveal",
    emoji: "🦅",
    prompt:
      "Overhead descending shot from high angle. Subject centered in frame. Clean geometric composition. Slow, deliberate camera descent.",
  },
  {
    id: "pov",
    label: "POV Shot",
    sublabel: "Through their eyes",
    emoji: "👀",
    prompt:
      "First-person POV walking through the scene. Subtle camera shake simulating natural head movement. Environment reacts to presence.",
  },
  {
    id: "dolly",
    label: "Dolly Zoom",
    sublabel: "Hitchcock effect",
    emoji: "🌀",
    prompt:
      "Slow dolly-zoom effect: subject stays in place while background expands dramatically. Growing tension and unease. Cinematic thriller feel.",
  },
  {
    id: "handheld",
    label: "Handheld",
    sublabel: "Documentary feel",
    emoji: "📷",
    prompt:
      "Handheld documentary-style camera. Natural improvised movements following the subject. Realistic, grounded, immediate feeling. Available light.",
  },
  {
    id: "crane",
    label: "Crane Up",
    sublabel: "Grand reveal",
    emoji: "🏗️",
    prompt:
      "Crane shot rising up and pulling back to reveal the wider environment. Starts intimate and expands to an epic scale. Sweeping and cinematic.",
  },
  {
    id: "cutaway",
    label: "Insert / Cutaway",
    sublabel: "Focus on detail",
    emoji: "🔍",
    prompt:
      "Extreme close-up insert shot of a specific detail or object in the scene. Still or minimal movement. Macro lens feel. Ultra-sharp focus.",
  },
];

interface ShotPresetsProps {
  onSelect: (prompt: string, presetId: string) => void;
  selectedId?: string | null;
  className?: string;
}

export function ShotPresets({ onSelect, selectedId, className }: ShotPresetsProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Shot Type
      </p>
      <div className="grid grid-cols-3 gap-2">
        {SHOT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.prompt, preset.id)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all hover:scale-[1.02]",
              selectedId === preset.id
                ? "border-[var(--accent)]/50 bg-[var(--accent-light)] shadow-sm"
                : "border-[var(--line-strong)] bg-white hover:border-[var(--accent)]/30 hover:bg-[var(--accent-light)]"
            )}
          >
            <span className="text-base leading-none">{preset.emoji}</span>
            <span className="mt-1 text-xs font-semibold leading-tight text-[var(--text-primary)]">
              {preset.label}
            </span>
            <span className="text-[10px] leading-tight text-[var(--text-muted)]">
              {preset.sublabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
