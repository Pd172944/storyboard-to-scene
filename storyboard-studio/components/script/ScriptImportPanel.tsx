"use client";

import { useState, useRef, useCallback } from "react";
import {
  Loader2, FileText, ChevronDown, ChevronUp,
  Zap, ImagePlus, X, Check, Users, Film,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { uploadFileToFalStorage } from "@/lib/fal/storage";
import type { ParsedScript } from "@/lib/script/parser";

interface CharacterSlot {
  name: string;
  previewUrl: string | null;
  falUrl: string | null;
  uploading: boolean;
}

interface ScriptImportPanelProps {
  projectId: string;
  seedImageUrl: string | null;
  onScenesCreated: (sceneIds: string[]) => void;
}

export function ScriptImportPanel({
  projectId,
  onScenesCreated,
}: ScriptImportPanelProps) {
  const [step, setStep] = useState<"input" | "parsed" | "running">("input");
  const [scriptText, setScriptText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedScript | null>(null);
  const [slots, setSlots] = useState<CharacterSlot[]>([]);
  const [scenesExpanded, setScenesExpanded] = useState(false);
  const [speculativeStarted, setSpeculativeStarted] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [launched, setLaunched] = useState(false);
  const speculativeStartedRef = useRef(false);

  const parseMutation = trpc.script.parseScript.useMutation();
  const speculativeMutation = trpc.script.startSpeculativeGen.useMutation();
  const importMutation = trpc.script.importScenes.useMutation();

  const handleParse = useCallback(async () => {
    if (!scriptText.trim()) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const result = await parseMutation.mutateAsync({ scriptText });
      setParsed(result);
      // One slot per detected character (cap at 6 for UI sanity)
      setSlots(
        result.characters.slice(0, 6).map((name) => ({
          name,
          previewUrl: null,
          falUrl: null,
          uploading: false,
        }))
      );
      setStep("parsed");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse script");
    } finally {
      setIsParsing(false);
    }
  }, [scriptText, parseMutation]);

  const handleImageSelect = useCallback(
    async (slotIndex: number, file: File) => {
      const localPreview = URL.createObjectURL(file);
      setSlots((prev) =>
        prev.map((s, i) =>
          i === slotIndex ? { ...s, previewUrl: localPreview, uploading: true, falUrl: null } : s
        )
      );

      try {
        const falUrl = await uploadFileToFalStorage(file);
        setSlots((prev) =>
          prev.map((s, i) =>
            i === slotIndex ? { ...s, falUrl, uploading: false } : s
          )
        );

        // Trigger speculative pre-generation on the very first uploaded image.
        // All scene Flux jobs start immediately so they're done by the time
        // the user finishes uploading the rest of their character photos.
        if (!speculativeStartedRef.current && parsed) {
          speculativeStartedRef.current = true;
          setSpeculativeStarted(true);
          speculativeMutation.mutate({
            projectId,
            scenes: parsed.scenes,
            characterRefUrl: falUrl,
          });
        }
      } catch {
        setSlots((prev) =>
          prev.map((s, i) =>
            i === slotIndex ? { ...s, uploading: false, previewUrl: null } : s
          )
        );
      }
    },
    [parsed, projectId, speculativeMutation]
  );

  const handleClearSlot = useCallback((slotIndex: number) => {
    setSlots((prev) =>
      prev.map((s, i) =>
        i === slotIndex ? { ...s, previewUrl: null, falUrl: null, uploading: false } : s
      )
    );
  }, []);

  const handleRun = useCallback(async () => {
    if (!parsed) return;
    setIsRunning(true);
    try {
      const assignments = slots
        .filter((s) => s.falUrl)
        .map((s) => ({ name: s.name, url: s.falUrl! }));

      const result = await importMutation.mutateAsync({
        projectId,
        scenes: parsed.scenes,
        characterAssignments: assignments,
      });

      // Show brief success state so the user sees confirmation before the
      // panel closes — avoids the jarring "it disappeared" feeling.
      setLaunched(true);
      setTimeout(() => onScenesCreated(result.sceneIds), 1400);
    } catch (err) {
      console.error("[ScriptImportPanel] importScenes failed:", err);
      setIsRunning(false);
    }
  }, [parsed, slots, projectId, importMutation, onScenesCreated]);

  // ── Step: input ──────────────────────────────────────────────────────────
  if (step === "input") {
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">
            Paste your screenplay
          </p>
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder={"INT. COFFEE SHOP — DAY\n\nJOE sits alone, staring at an empty cup. MARIA enters, stops cold when she sees him.\n\nMARIA\nI thought you left.\n\n..."}
            rows={14}
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/50 focus:outline-none focus:ring-0"
          />
        </div>

        {parseError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {parseError}
          </p>
        )}

        <button
          onClick={handleParse}
          disabled={!scriptText.trim() || isParsing}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--accent-deep)] active:scale-[0.98]"
        >
          {isParsing ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Parsing script…</>
          ) : (
            <><FileText className="h-4 w-4" />Parse Script</>
          )}
        </button>
      </div>
    );
  }

  // ── Step: parsed ─────────────────────────────────────────────────────────
  if (step === "parsed" && parsed) {
    const assignedCount = slots.filter((s) => s.falUrl).length;
    const canRun = !isRunning;

    return (
      <div className="flex flex-col gap-4">
        {/* Summary pill */}
        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5">
          <Film className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {parsed.scenes.length} scene{parsed.scenes.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[var(--line-strong)]">·</span>
          <Users className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span className="text-xs text-[var(--text-muted)]">
            {parsed.characters.length} character{parsed.characters.length !== 1 ? "s" : ""}
          </span>
          {speculativeStarted && (
            <>
              <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                <Zap className="h-3 w-3" />
                Pre-generating…
              </span>
            </>
          )}
        </div>

        {/* Character slots */}
        {slots.length > 0 && (
          <section className="space-y-2">
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">
              Character photos{" "}
              <span className="font-normal text-[var(--text-muted)]">— optional, improves identity</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot, i) => (
                <CharacterSlotCard
                  key={slot.name}
                  slot={slot}
                  onSelect={(file) => handleImageSelect(i, file)}
                  onClear={() => handleClearSlot(i)}
                />
              ))}
            </div>
            {assignedCount > 0 && (
              <p className="text-[10px] text-[var(--text-muted)]">
                {assignedCount} of {slots.length} photos added
                {speculativeStarted && " · keyframes generating in background"}
              </p>
            )}
          </section>
        )}

        {/* Scene list (collapsible) */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)]">
          <button
            type="button"
            onClick={() => setScenesExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]"
          >
            <span>Preview scenes</span>
            {scenesExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {scenesExpanded && (
            <ol className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {parsed.scenes.map((scene, i) => (
                <li key={i} className="px-3.5 py-2.5 space-y-0.5">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {i + 1}. {scene.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                    {scene.location}
                    {scene.weather ? ` · ${scene.weather}` : ""}
                  </p>
                  {scene.action && (
                    <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {scene.action}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Run button / success state */}
        {launched ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 py-3 text-sm font-semibold text-green-700">
            <Check className="h-4 w-4" />
            {parsed.scenes.length} scenes queued — opening studio…
          </div>
        ) : (
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--accent-deep)] active:scale-[0.98]"
          >
            {isRunning ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Queuing scenes…</>
            ) : (
              <><Zap className="h-4 w-4" />Run — Generate {parsed.scenes.length} Scenes</>
            )}
          </button>
        )}

        {/* Back link */}
        <button
          onClick={() => { setStep("input"); setParseError(null); }}
          className="text-center text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
        >
          ← Edit script
        </button>
      </div>
    );
  }

  return null;
}

// ── Character slot card ──────────────────────────────────────────────────────

interface CharacterSlotCardProps {
  slot: CharacterSlot;
  onSelect: (file: File) => void;
  onClear: () => void;
}

function CharacterSlotCard({ slot, onSelect, onClear }: CharacterSlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => !slot.previewUrl && inputRef.current?.click()}
        className={`relative aspect-square w-full overflow-hidden rounded-xl border transition ${
          slot.previewUrl
            ? "border-[var(--accent)]/40 cursor-default"
            : "border-dashed border-[var(--line-strong)] bg-[var(--bg)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 cursor-pointer"
        }`}
      >
        {slot.uploading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          </div>
        ) : slot.previewUrl ? (
          <>
            <img
              src={slot.previewUrl}
              alt={slot.name}
              className="h-full w-full object-cover"
            />
            {slot.falUrl && (
              <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 shadow">
                <Check className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImagePlus className="h-5 w-5 text-[var(--text-muted)] opacity-50" />
          </div>
        )}
      </button>

      {/* Character name tag */}
      <div className="flex items-center justify-between gap-1">
        <span className="truncate rounded-md bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] border border-[var(--line)]">
          {slot.name}
        </span>
        {slot.previewUrl && !slot.uploading && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-red-500 transition"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
