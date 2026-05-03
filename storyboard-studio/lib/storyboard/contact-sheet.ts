"use client";

const MIN_STORYBOARD_FRAMES = 3;
const MAX_STORYBOARD_FRAMES = 5;
const HERO_WIDTH = 896;
const HERO_HEIGHT = 504;
const STRIP_FRAME_WIDTH = 280;
const STRIP_FRAME_HEIGHT = 158;
const GAP = 24;
const PADDING = 24;
const BACKGROUND = "#050816";
const FRAME_BACKGROUND = "#111827";

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load storyboard frame "${file.name}"`));
    };

    image.src = objectUrl;
  });
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;

  ctx.fillStyle = FRAME_BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

export async function createStoryboardContactSheetFile(
  files: File[],
  heroIndex = 0,
  filename = `storyboard-sheet-${Date.now()}.png`
): Promise<File> {
  if (
    files.length < MIN_STORYBOARD_FRAMES ||
    files.length > MAX_STORYBOARD_FRAMES
  ) {
    throw new Error("Upload between 3 and 5 storyboard frames");
  }

  const images = await Promise.all(files.map(loadImageFromFile));
  const safeHeroIndex =
    heroIndex >= 0 && heroIndex < files.length ? heroIndex : 0;
  const heroImage = images[safeHeroIndex];
  const stripImages = images.filter((_, index) => index !== safeHeroIndex);
  const canvas = document.createElement("canvas");
  const stripRows = Math.max(stripImages.length, 1);
  const stripHeight =
    stripRows * STRIP_FRAME_HEIGHT + Math.max(stripRows - 1, 0) * GAP;
  const width = PADDING * 2 + HERO_WIDTH + GAP + STRIP_FRAME_WIDTH;
  const height = PADDING * 2 + Math.max(HERO_HEIGHT, stripHeight);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create storyboard contact sheet");
  }

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#d2ff72";
  ctx.font = "600 22px sans-serif";
  ctx.fillText("Hero Reference", PADDING, 18 + PADDING);
  ctx.fillStyle = "#7c8aa5";
  ctx.font = "500 18px sans-serif";
  ctx.fillText("Storyboard Beats", PADDING + HERO_WIDTH + GAP, 18 + PADDING);

  drawContainedImage(
    ctx,
    heroImage,
    PADDING,
    PADDING + 24,
    HERO_WIDTH,
    HERO_HEIGHT
  );

  stripImages.forEach((image, index) => {
    const x = PADDING + HERO_WIDTH + GAP;
    const y = PADDING + 24 + index * (STRIP_FRAME_HEIGHT + GAP);

    drawContainedImage(
      ctx,
      image,
      x,
      y,
      STRIP_FRAME_WIDTH,
      STRIP_FRAME_HEIGHT
    );
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Failed to encode storyboard contact sheet"));
        return;
      }
      resolve(value);
    }, "image/webp", 0.86);
  });

  return new File([blob], filename.replace(/\.png$/, ".webp"), {
    type: "image/webp",
  });
}

export { MAX_STORYBOARD_FRAMES, MIN_STORYBOARD_FRAMES };
