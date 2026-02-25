"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CharacterRefUploadProps {
  onUpload: (file: File) => void;
  onRemove: () => void;
  previewUrl: string | null;
  className?: string;
  disabled?: boolean;
}

export function CharacterRefUpload({
  onUpload,
  onRemove,
  previewUrl,
  className,
  disabled = false,
}: CharacterRefUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        return;
      }
      onUpload(file);
    },
    [onUpload]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      // Reset input so re-selecting the same file triggers onChange
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Character Reference Image</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
          <img
            src={previewUrl}
            alt="Character reference"
            className="h-48 w-full object-cover"
          />
          <Button
            variant="destructive"
            size="sm"
            onClick={onRemove}
            disabled={disabled}
            className="absolute right-2 top-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors",
            isDragOver
              ? "border-indigo-500 bg-indigo-500/10"
              : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700">
            {isDragOver ? (
              <Upload className="h-5 w-5 text-indigo-400" />
            ) : (
              <ImageIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <p className="text-sm text-gray-400">
            {isDragOver ? "Drop image here" : "Click or drag to upload"}
          </p>
          <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
        </div>
      )}
    </div>
  );
}
