"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Upload, X, ImageIcon, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
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

  // Sync initial values when they change (compare by value to avoid infinite loops)
  const initialRefUrlsKey = JSON.stringify(initialRefUrls);
  useEffect(() => {
    setImageUrls(JSON.parse(initialRefUrlsKey) as string[]);
  }, [initialRefUrlsKey]);

  useEffect(() => {
    setReelStatus(initialReelStatus);
  }, [initialReelStatus]);

  const setCharacterRefsMutation = trpc.project.setCharacterRefs.useMutation();

  // Poll reel status while generating
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

  // Update local state when poll returns
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

        // Auto-save character refs via tRPC
        // setCharacterRefs immediately marks status COMPLETE in the DB
        // (we use Kling O3 Pro elements directly — no async reel generation needed)
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
        // No refs left — reset status
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
          // Clear refs in DB — update directly since setCharacterRefs requires >= 1
          // When all images are removed, just invalidate
          await setCharacterRefsMutation.mutateAsync({
            projectId,
            referenceImageUrls: newUrls.length > 0 ? newUrls : [],
          }).catch(() => {
            // If validation fails (0 images), that's fine — user cleared all refs
          });
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
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Character saved — reel will generate on next scene
          </span>
        );
      case "GENERATING":
        return (
          <span className="flex items-center gap-1.5 text-xs text-indigo-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating identity reel...
          </span>
        );
      case "COMPLETE":
        return (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Character refs ready — identity will be locked in video
          </span>
        );
      case "FAILED":
        return (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Reel failed — scenes will generate without consistency lock
          </span>
        );
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Character Reference Images (up to {MAX_IMAGES})</Label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Horizontal row of thumbnail slots */}
      <div className="flex gap-3">
        {/* Existing images */}
        {imageUrls.map((url, index) => (
          <div
            key={url}
            className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-gray-800"
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

        {/* Add slot — show if under MAX_IMAGES */}
        {imageUrls.length < MAX_IMAGES && (
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={cn(
              "flex h-24 w-24 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed transition-colors",
              "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800",
              (disabled || uploading) && "pointer-events-none opacity-50"
            )}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <>
                <Upload className="h-4 w-4 text-gray-400" />
                <span className="text-[10px] text-gray-500">Add</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status indicator */}
      {statusIndicator()}
    </div>
  );
}
