"use client";

import {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { Stage, Layer, Line, Rect } from "react-konva";
import type Konva from "konva";
import { Pencil, Eraser, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasTools, type CanvasLine } from "@/components/canvas/useCanvasTools";
import { cn } from "@/lib/utils";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GRID_SIZE = 25;
const GRID_COLOR = "#2a2a4a";
const BACKGROUND_COLOR = "#1a1a2e";

export interface StoryboardCanvasHandle {
  getSketchDataUrl: () => string;
}

interface StoryboardCanvasProps {
  className?: string;
}

const StoryboardCanvas = forwardRef<
  StoryboardCanvasHandle,
  StoryboardCanvasProps
>(({ className }, ref) => {
  const stageRef = useRef<Konva.Stage>(null);

  const {
    tool,
    setTool,
    lines,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    clearCanvas,
    undo,
  } = useCanvasTools({ stageRef });

  const getSketchDataUrl = useCallback((): string => {
    const stage = stageRef.current;
    if (!stage) throw new Error("Canvas stage is not available");
    return stage.toDataURL({ pixelRatio: 2 });
  }, []);

  useImperativeHandle(ref, () => ({
    getSketchDataUrl,
  }));

  // Generate grid lines for the background
  const gridLines: Array<{ points: number[]; key: string }> = [];
  for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE) {
    gridLines.push({
      points: [x, 0, x, CANVAS_HEIGHT],
      key: `v-${x}`,
    });
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE) {
    gridLines.push({
      points: [0, y, CANVAS_WIDTH, y],
      key: `h-${y}`,
    });
  }

  return (
    <div className={cn("relative", className)}>
      {/* Tool bar overlay */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900/90 p-1 backdrop-blur-sm">
        <Button
          variant={tool === "pencil" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTool("pencil")}
          title="Pencil"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant={tool === "eraser" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTool("eraser")}
          title="Eraser"
        >
          <Eraser className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-6 w-px bg-gray-700" />
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearCanvas}
          title="Clear canvas"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas */}
      <div className="overflow-hidden rounded-xl border border-gray-700">
        <Stage
          ref={stageRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: tool === "eraser" ? "crosshair" : "default" }}
        >
          {/* Background layer */}
          <Layer listening={false}>
            <Rect
              x={0}
              y={0}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              fill={BACKGROUND_COLOR}
            />
            {gridLines.map((line) => (
              <Line
                key={line.key}
                points={line.points}
                stroke={GRID_COLOR}
                strokeWidth={0.5}
                listening={false}
              />
            ))}
          </Layer>

          {/* Drawing layer */}
          <Layer>
            {lines.map((line: CanvasLine, i: number) => (
              <Line
                key={i}
                points={line.points}
                stroke={line.tool === "eraser" ? BACKGROUND_COLOR : "#e0e0e0"}
                strokeWidth={line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === "eraser" ? "destination-out" : "source-over"
                }
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

StoryboardCanvas.displayName = "StoryboardCanvas";

export { StoryboardCanvas };
