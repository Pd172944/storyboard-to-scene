"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onImageReady: (file: File, previewUrl: string) => void;
  currentImage?: string | null;
  uploading?: boolean;
  className?: string;
  compact?: boolean;
}

export function DropZone({
  onImageReady,
  currentImage,
  uploading = false,
  className,
  compact = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      onImageReady(file, url);
    },
    [onImageReady]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFile]
  );

  if (currentImage) {
    return (
      <div
        className={cn("relative overflow-hidden rounded-2xl cursor-pointer group border border-[var(--line-strong)]", className)}
        onClick={() => inputRef.current?.click()}
      >
        <img
          src={currentImage}
          alt="Source reference"
          className="w-full h-auto object-cover"
          style={{ maxHeight: compact ? 200 : 340 }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="rounded-xl border border-white/40 bg-white/80 px-4 py-2 backdrop-blur-sm shadow-sm">
            <p className="text-sm text-[var(--text-primary)] font-medium">Replace image</p>
          </div>
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none",
        isDragging
          ? "border-[var(--accent)] bg-[var(--accent-light)] scale-[1.01]"
          : "border-[var(--line-strong)] bg-white hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)]",
        compact ? "min-h-[160px] p-6" : "min-h-[260px] p-10",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />

      {uploading ? (
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      ) : (
        <>
          <div
            className={cn(
              "rounded-2xl border border-[var(--line-strong)] bg-[var(--bg)] flex items-center justify-center mb-4",
              compact ? "h-10 w-10" : "h-14 w-14"
            )}
          >
            {isDragging ? (
              <ImageIcon className={cn("text-[var(--accent)]", compact ? "h-5 w-5" : "h-7 w-7")} />
            ) : (
              <Upload className={cn("text-[var(--text-muted)]", compact ? "h-4 w-4" : "h-6 w-6")} />
            )}
          </div>
          <p className={cn("font-semibold text-[var(--text-primary)]", compact ? "text-sm" : "text-base")}>
            {isDragging ? "Drop to use this image" : "Drop a photo here"}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            or click to browse — JPG, PNG, WEBP
          </p>
        </>
      )}
    </div>
  );
}
