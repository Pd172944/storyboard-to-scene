import { useState, useCallback, type RefObject } from "react";
import type Konva from "konva";

export type CanvasTool = "pencil" | "eraser";

interface CanvasLine {
  tool: CanvasTool;
  points: number[];
  strokeWidth: number;
}

interface UseCanvasToolsOptions {
  stageRef: RefObject<Konva.Stage | null>;
  initialTool?: CanvasTool;
  pencilWidth?: number;
  eraserWidth?: number;
}

interface UseCanvasToolsReturn {
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  lines: CanvasLine[];
  isDrawing: boolean;
  handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  handleMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  handleMouseUp: () => void;
  handleTouchStart: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  handleTouchMove: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  handleTouchEnd: () => void;
  clearCanvas: () => void;
  undo: () => void;
}

export function useCanvasTools({
  stageRef,
  initialTool = "pencil",
  pencilWidth = 3,
  eraserWidth = 20,
}: UseCanvasToolsOptions): UseCanvasToolsReturn {
  const [tool, setTool] = useState<CanvasTool>(initialTool);
  const [lines, setLines] = useState<CanvasLine[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const getPointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    return pos;
  }, [stageRef]);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Prevent default to avoid text selection
      e.evt.preventDefault();
      setIsDrawing(true);

      const pos = getPointerPosition();
      if (!pos) return;

      const strokeWidth = tool === "eraser" ? eraserWidth : pencilWidth;
      setLines((prev) => [
        ...prev,
        { tool, points: [pos.x, pos.y], strokeWidth },
      ]);
    },
    [tool, getPointerPosition, pencilWidth, eraserWidth]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isDrawing) return;
      e.evt.preventDefault();

      const pos = getPointerPosition();
      if (!pos) return;

      setLines((prev) => {
        const lastLine = prev[prev.length - 1];
        if (!lastLine) return prev;
        const updated = {
          ...lastLine,
          points: [...lastLine.points, pos.x, pos.y],
        };
        return [...prev.slice(0, -1), updated];
      });
    },
    [isDrawing, getPointerPosition]
  );

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      e.evt.preventDefault();
      setIsDrawing(true);

      const pos = getPointerPosition();
      if (!pos) return;

      const strokeWidth = tool === "eraser" ? eraserWidth : pencilWidth;
      setLines((prev) => [
        ...prev,
        { tool, points: [pos.x, pos.y], strokeWidth },
      ]);
    },
    [tool, getPointerPosition, pencilWidth, eraserWidth]
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (!isDrawing) return;
      e.evt.preventDefault();

      const pos = getPointerPosition();
      if (!pos) return;

      setLines((prev) => {
        const lastLine = prev[prev.length - 1];
        if (!lastLine) return prev;
        const updated = {
          ...lastLine,
          points: [...lastLine.points, pos.x, pos.y],
        };
        return [...prev.slice(0, -1), updated];
      });
    },
    [isDrawing, getPointerPosition]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    setLines([]);
  }, []);

  const undo = useCallback(() => {
    setLines((prev) => prev.slice(0, -1));
  }, []);

  return {
    tool,
    setTool,
    lines,
    isDrawing,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    clearCanvas,
    undo,
  };
}

export type { CanvasLine };
