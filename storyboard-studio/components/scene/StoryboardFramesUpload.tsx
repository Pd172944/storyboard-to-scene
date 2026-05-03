"use client";

import { useMemo, useEffect, useCallback, useRef } from "react";
import { Film, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  MAX_STORYBOARD_FRAMES,
  MIN_STORYBOARD_FRAMES,
} from "@/lib/storyboard/contact-sheet";

interface StoryboardFramesUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  heroFrameIndex?: number;
  onHeroFrameChange?: (index: number) => void;
  disabled?: boolean;
  uploading?: boolean;
  className?: string;
}

export function StoryboardFramesUpload({
  files,
  onChange,
  heroFrameIndex = 0,
  onHeroFrameChange,
  disabled = false,
  uploading = false,
  className,
}: StoryboardFramesUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const mergeFiles = useCallback(
    (incoming: FileList | File[]) => {
      const imageFiles = Array.from(incoming).filter((file) =>
        file.type.startsWith("image/")
      );

      if (imageFiles.length === 0) {
        return;
      }

      const nextFiles = [...files, ...imageFiles].slice(0, MAX_STORYBOARD_FRAMES);
      onChange(nextFiles);
    },
    [files, onChange]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        mergeFiles(event.target.files);
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [mergeFiles]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      mergeFiles(event.dataTransfer.files);
    },
    [mergeFiles]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const nextFiles = files.filter((_, currentIndex) => currentIndex !== index);
      onChange(nextFiles);

      if (!onHeroFrameChange) {
        return;
      }

      if (nextFiles.length === 0) {
        onHeroFrameChange(0);
        return;
      }

      if (index === heroFrameIndex) {
        onHeroFrameChange(0);
        return;
      }

      if (index < heroFrameIndex) {
        onHeroFrameChange(heroFrameIndex - 1);
      }
    },
    [files, heroFrameIndex, onChange, onHeroFrameChange]
  );

  const handleOpenPicker = useCallback(() => {
    if (!disabled && !uploading) {
      inputRef.current?.click();
    }
  }, [disabled, uploading]);

  const ready = files.length >= MIN_STORYBOARD_FRAMES;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>Storyboard Frames</Label>
          <p className="mt-1 text-[11px] leading-5 text-gray-500">
            Upload 3 to 5 storyboard stills and mark one as the hero reference. The app will build a hero-first sheet for scene generation.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]",
            ready
              ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : "border border-amber-400/20 bg-amber-400/10 text-amber-300"
          )}
        >
          {files.length}/{MAX_STORYBOARD_FRAMES} frames
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || uploading}
      />

      <div
        onClick={handleOpenPicker}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        className={cn(
          "rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 transition-colors",
          !disabled && !uploading && "cursor-pointer hover:border-white/20 hover:bg-white/[0.03]",
          (disabled || uploading) && "pointer-events-none opacity-70"
        )}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
            ) : (
              <Film className="h-5 w-5 text-[var(--accent)]" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Build the scene from a storyboard sequence
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Mix close-ups, wides, and action beats so the model can infer staging and motion.
            </p>
          </div>
        </div>

        {previews.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {previews.map((preview, index) => (
              <div
                key={`${preview.file.name}-${index}`}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-black"
              >
                <img
                  src={preview.url}
                  alt={`Storyboard frame ${index + 1}`}
                  className="aspect-video h-full w-full object-cover"
                />
                {index === heroFrameIndex && (
                  <span className="absolute left-2 top-2 rounded-md bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                    Hero
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-white/80">Frame {index + 1}</span>
                    {index !== heroFrameIndex && onHeroFrameChange && (
                      <button
                        type="button"
                        className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/80 transition hover:border-white/40 hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          onHeroFrameChange(index);
                        }}
                        disabled={disabled || uploading}
                      >
                        Set hero
                      </button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-white/70 hover:text-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemove(index);
                    }}
                    disabled={disabled || uploading}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center">
            <Upload className="h-5 w-5 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Drop storyboard frames here or click to upload.
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              JPG, PNG, WEBP
            </p>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        {ready
          ? "Sequence ready. The hero frame will anchor identity; the strip will anchor staging and motion."
          : `Add at least ${MIN_STORYBOARD_FRAMES} storyboard frames before previewing.`}
      </p>
    </div>
  );
}
