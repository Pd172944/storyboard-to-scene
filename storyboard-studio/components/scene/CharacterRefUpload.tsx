"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { uploadFileToFalStorage } from "@/lib/fal/storage";
import type { CharacterReelStatus } from "@/lib/studio/status";

const MAX_IMAGES = 3;

interface CharacterRefUploadProps {
  projectId: string;
  initialRefUrls?: string[];
  initialReelStatus?: CharacterReelStatus;
  className?: string;
  disabled?: boolean;
}

export function CharacterRefUpload({
  projectId,
  initialRefUrls = [],
  initialReelStatus = "NONE",
  className,
  disabled = false,
}: CharacterRefUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrls, setImageUrls] = useState<string[]>(initialRefUrls);
  const [uploading, setUploading] = useState(false);
  const [reelStatus, setReelStatus] = useState<CharacterReelStatus>(initialReelStatus);

  const initialRefUrlsKey = JSON.stringify(initialRefUrls);
  useEffect(() => {
    setImageUrls(JSON.parse(initialRefUrlsKey) as string[]);
  }, [initialRefUrlsKey]);

  useEffect(() => {
    setReelStatus(initialReelStatus);
  }, [initialReelStatus]);

  const setCharacterRefsMutation = trpc.project.setCharacterRefs.useMutation();

  const reelStatusQuery = trpc.project.getCharacterReelStatus.useQuery(
    { projectId },
    {
      enabled: reelStatus === "GENERATING",
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "COMPLETE" || status === "FAILED" || status === "NONE") {
          return false;
        }
        return 4000;
      },
    }
  );

  useEffect(() => {
    if (reelStatusQuery.data) {
      setReelStatus(reelStatusQuery.data.status);
    }
  }, [reelStatusQuery.data]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (imageUrls.length >= MAX_IMAGES) return;

      setUploading(true);
      try {
        const url = await uploadFileToFalStorage(file);
        const newUrls = [...imageUrls, url];
        setImageUrls(newUrls);

        await setCharacterRefsMutation.mutateAsync({
          projectId,
          referenceImageUrls: newUrls,
        });
        setReelStatus("COMPLETE");
      } catch (error) {
        console.error("Failed to upload reference image:", error);
      } finally {
        setUploading(false);
      }
    },
    [imageUrls, projectId, setCharacterRefsMutation]
  );

  const handleRemove = useCallback(
    async (index: number) => {
      const newUrls = imageUrls.filter((_, i) => i !== index);
      setImageUrls(newUrls);

      if (newUrls.length === 0) {
        setReelStatus("NONE");
      }

      try {
        if (newUrls.length > 0) {
          await setCharacterRefsMutation.mutateAsync({
            projectId,
            referenceImageUrls: newUrls,
          });
          setReelStatus("COMPLETE");
        } else {
          await setCharacterRefsMutation.mutateAsync({
            projectId,
            referenceImageUrls: [],
          }).catch(() => {});
        }
      } catch (error) {
        console.error("Failed to update character refs:", error);
      }
    },
    [imageUrls, projectId, setCharacterRefsMutation]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const statusIndicator = () => {
    switch (reelStatus) {
      case "NONE":
        return null;
      case "PENDING":
        return (
          <span className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            Character saved — will apply on next scene
          </span>
        );
      case "GENERATING":
        return (
          <span className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating identity reel...
          </span>
        );
      case "COMPLETE":
        return (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Character refs ready — identity locked in video
          </span>
        );
      case "FAILED":
        return (
          <span className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3 w-3" />
            Reel failed — scenes will generate without consistency lock
          </span>
        );
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-[var(--text-secondary)]">Character References (up to {MAX_IMAGES})</Label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || uploading}
      />

      <div className="flex gap-3">
        {imageUrls.map((url, index) => (
          <div
            key={url}
            className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--bg)]"
          >
            <img
              src={url}
              alt={`Character ref ${index + 1}`}
              className="h-full w-full object-cover"
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRemove(index)}
              disabled={disabled || uploading}
              className="absolute right-0.5 top-0.5 h-5 w-5 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}

        {imageUrls.length < MAX_IMAGES && (
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={cn(
              "flex h-24 w-24 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed transition-colors",
              "border-[var(--line-strong)] bg-white hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)]",
              (disabled || uploading) && "pointer-events-none opacity-50"
            )}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
            ) : (
              <>
                <Upload className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-[10px] text-[var(--text-muted)]">Add</span>
              </>
            )}
          </div>
        )}
      </div>

      {statusIndicator()}
    </div>
  );
}
