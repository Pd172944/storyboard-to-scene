"""
Local inference server for Storyboard Studio.

Runs local AI models so you can generate frames and videos without fal.ai API calls.
Useful for cost control, low-latency development, or air-gapped environments.

GPU mode (fast): ENABLE_GPU=true  — uses CUDA, Flash Attention, ~3s/frame, ~10s/video
CPU mode (slow): default          — uses sliding-window sparse attention, ~30s/frame

Models downloaded on first run:
- Frame: black-forest-labs/FLUX.1-schnell (~23GB, fp16)
- Video: Lightricks/LTX-Video (~9GB, fp16)

Usage:
  pip install -r requirements.txt
  ENABLE_GPU=true python server.py        # GPU mode
  python server.py                        # CPU mode (frame-gen only; video uses fal)

Next.js integration:
  Set INFERENCE_MODE=local and LOCAL_INFERENCE_URL=http://localhost:8765
  in your .env.local to route requests here instead of fal.ai
"""

import os
import time
import uuid
import logging
import asyncio
from io import BytesIO
from typing import Optional

import torch
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from sparse_attention import build_sparse_config, apply_sparse_attention_to_model, log_attention_stats

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("inference")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ENABLE_GPU = os.environ.get("ENABLE_GPU", "").lower() in ("1", "true", "yes")
GPU_MEMORY_LIMIT_GB = int(os.environ.get("GPU_MEMORY_LIMIT_GB", "8"))
DEVICE = "cuda" if (ENABLE_GPU and torch.cuda.is_available()) else "cpu"
SPARSE_WINDOW = 32  # sliding-window half-size for CPU sparse attention

log.info(f"Inference device: {DEVICE} (GPU_ENABLED={ENABLE_GPU})")
if DEVICE == "cuda":
    log.info(f"CUDA device: {torch.cuda.get_device_name(0)}")
    log.info(f"CUDA VRAM: {torch.cuda.get_device_properties(0).total_memory // (1024**3)}GB total")

# ---------------------------------------------------------------------------
# Lazy model holders — loaded on first request to keep startup fast
# ---------------------------------------------------------------------------
_flux_pipe = None
_ltx_pipe = None

def load_flux():
    global _flux_pipe
    if _flux_pipe is not None:
        return _flux_pipe

    log.info("Loading Flux Schnell (fast frame generation)...")
    from diffusers import FluxPipeline

    dtype = torch.float16 if DEVICE == "cuda" else torch.float32
    pipe = FluxPipeline.from_pretrained(
        "black-forest-labs/FLUX.1-schnell",
        torch_dtype=dtype,
    )

    if DEVICE == "cuda":
        # Offload layers to CPU when not in use — fits in 8GB VRAM
        pipe.enable_model_cpu_offload()
        pipe.enable_attention_slicing()
        log.info("Flux loaded on GPU with CPU offload + attention slicing")
    else:
        pipe = pipe.to("cpu")
        config = build_sparse_config(device="cpu", window=SPARSE_WINDOW, sinks=16)
        pipe.transformer = apply_sparse_attention_to_model(pipe.transformer, config)
        stats = log_attention_stats(pipe.transformer, seq_len=256, window=SPARSE_WINDOW, sinks=16)
        log.info(f"Flux on CPU — sparse attention: {stats['reduction_pct']}% fewer ops (sink={16} window={SPARSE_WINDOW})")

    _flux_pipe = pipe
    return pipe


def load_ltx():
    global _ltx_pipe
    if _ltx_pipe is not None:
        return _ltx_pipe

    if DEVICE == "cpu":
        log.warning("LTX-Video is very slow on CPU (~3 min/clip). Consider ENABLE_GPU=true.")

    log.info("Loading LTX-Video (image-to-video)...")
    from diffusers import LTXImageToVideoPipeline

    dtype = torch.float16 if DEVICE == "cuda" else torch.bfloat16
    pipe = LTXImageToVideoPipeline.from_pretrained(
        "Lightricks/LTX-Video",
        torch_dtype=dtype,
    )

    if DEVICE == "cuda":
        pipe.enable_model_cpu_offload()
        pipe.enable_attention_slicing()
        # Enable Flash Attention kernel on GPU
        pipe.transformer.enable_gradient_checkpointing()
        torch.backends.cuda.enable_flash_sdp(True)
        log.info("LTX-Video loaded on GPU with Flash Attention")
    else:
        pipe = pipe.to("cpu")
        config = build_sparse_config(device="cpu", window=SPARSE_WINDOW, sinks=16)
        pipe.transformer = apply_sparse_attention_to_model(pipe.transformer, config)
        log.info("LTX-Video on CPU — sparse-attention-hub (SinkMasker + LocalMasker)")

    _ltx_pipe = pipe
    return pipe


# ---------------------------------------------------------------------------
# FAL storage upload (reuse fal CDN for output, keeps URLs consistent)
# ---------------------------------------------------------------------------
import httpx

async def upload_image_to_fal(image: Image.Image, filename: str) -> str:
    """Upload a PIL image to fal storage, returns fal CDN URL."""
    fal_key = os.environ.get("FAL_KEY", "")
    if not fal_key:
        raise RuntimeError("FAL_KEY env var required to upload inference outputs")

    # Convert to bytes
    buf = BytesIO()
    image.save(buf, format="WEBP", quality=90)
    buf.seek(0)
    data = buf.getvalue()

    async with httpx.AsyncClient() as client:
        # Step 1: initiate upload
        resp = await client.post(
            "https://rest.fal.run/storage/upload/initiate",
            headers={"Authorization": f"Key {fal_key}"},
            json={"file_name": filename, "content_type": "image/webp"},
        )
        resp.raise_for_status()
        body = resp.json()

        # Step 2: PUT to presigned URL
        await client.put(
            body["upload_url"],
            content=data,
            headers={"Content-Type": "image/webp"},
        )

        return body["file_url"]


async def upload_video_to_fal(video_path: str, filename: str) -> str:
    """Upload a video file to fal storage, returns fal CDN URL."""
    fal_key = os.environ.get("FAL_KEY", "")
    if not fal_key:
        raise RuntimeError("FAL_KEY env var required to upload inference outputs")

    with open(video_path, "rb") as f:
        data = f.read()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://rest.fal.run/storage/upload/initiate",
            headers={"Authorization": f"Key {fal_key}"},
            json={"file_name": filename, "content_type": "video/mp4"},
        )
        resp.raise_for_status()
        body = resp.json()

        await client.put(
            body["upload_url"],
            content=data,
            headers={"Content-Type": "video/mp4"},
        )

        return body["file_url"]


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Storyboard Studio Local Inference", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class GenerateFrameRequest(BaseModel):
    image_url: str           # source image URL (storyboard sketch or character ref)
    prompt: str              # scene description
    num_steps: int = 4       # Flux Schnell default; 4 is already high quality
    guidance_scale: float = 0.0  # Schnell doesn't use guidance; kept for API compat


class GenerateFrameResponse(BaseModel):
    image_url: str
    latency_ms: int
    device: str


class GenerateVideoRequest(BaseModel):
    image_url: str           # starting frame (output of generate-frame)
    prompt: str              # motion description
    num_frames: int = 33     # ~2.7s at 12fps
    num_steps: int = 16      # LTX default
    guidance_scale: float = 2.6


class GenerateVideoResponse(BaseModel):
    video_url: str
    latency_ms: int
    device: str


class HealthResponse(BaseModel):
    status: str
    device: str
    cuda_available: bool
    cuda_device_name: Optional[str]
    vram_total_gb: Optional[float]
    vram_free_gb: Optional[float]
    flux_loaded: bool
    ltx_loaded: bool


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health():
    cuda_ok = torch.cuda.is_available()
    vram_total = None
    vram_free = None
    if cuda_ok:
        props = torch.cuda.get_device_properties(0)
        vram_total = props.total_memory / (1024 ** 3)
        vram_free = (props.total_memory - torch.cuda.memory_allocated(0)) / (1024 ** 3)

    return HealthResponse(
        status="ok",
        device=DEVICE,
        cuda_available=cuda_ok,
        cuda_device_name=torch.cuda.get_device_name(0) if cuda_ok else None,
        vram_total_gb=round(vram_total, 2) if vram_total else None,
        vram_free_gb=round(vram_free, 2) if vram_free else None,
        flux_loaded=_flux_pipe is not None,
        ltx_loaded=_ltx_pipe is not None,
    )


@app.post("/generate-frame", response_model=GenerateFrameResponse)
async def generate_frame(req: GenerateFrameRequest):
    """
    Generate a photorealistic frame from a source image + prompt.
    Uses Flux Schnell locally with sparse attention (CPU) or Flash Attention (GPU).
    """
    t0 = time.perf_counter()

    # Download source image
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(req.image_url)
        resp.raise_for_status()
        source_image = Image.open(BytesIO(resp.content)).convert("RGB")

    # Load model (lazy)
    pipe = await asyncio.get_event_loop().run_in_executor(None, load_flux)

    # Run inference in thread pool (blocking)
    def run_flux():
        with torch.inference_mode():
            result = pipe(
                prompt=req.prompt,
                image=source_image,
                num_inference_steps=req.num_steps,
                guidance_scale=req.guidance_scale,
                width=1024,
                height=576,
            )
        return result.images[0]

    output_image = await asyncio.get_event_loop().run_in_executor(None, run_flux)

    # Upload result to fal storage
    filename = f"local-frame-{uuid.uuid4().hex[:8]}.webp"
    image_url = await upload_image_to_fal(output_image, filename)

    latency = int((time.perf_counter() - t0) * 1000)
    log.info(f"generate-frame: {latency}ms on {DEVICE}")

    return GenerateFrameResponse(image_url=image_url, latency_ms=latency, device=DEVICE)


@app.post("/generate-video", response_model=GenerateVideoResponse)
async def generate_video(req: GenerateVideoRequest):
    """
    Generate a short video clip from a starting frame + motion prompt.
    Uses LTX-Video locally with sparse attention (CPU) or Flash Attention (GPU).

    NOTE: LTX-Video on CPU takes ~3 minutes per clip. GPU is strongly recommended.
    """
    if DEVICE == "cpu":
        log.warning("generate-video on CPU will take ~3 minutes. Consider ENABLE_GPU=true.")

    t0 = time.perf_counter()

    # Download starting frame
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(req.image_url)
        resp.raise_for_status()
        start_frame = Image.open(BytesIO(resp.content)).convert("RGB")

    # Load model (lazy)
    pipe = await asyncio.get_event_loop().run_in_executor(None, load_ltx)

    # Run inference
    def run_ltx():
        with torch.inference_mode():
            result = pipe(
                image=start_frame,
                prompt=req.prompt,
                negative_prompt="worst quality, animation, cartoon, anime, deformed, rubbery",
                num_frames=req.num_frames,
                num_inference_steps=req.num_steps,
                guidance_scale=req.guidance_scale,
                width=768,
                height=432,
            )
        return result.frames[0]  # list of PIL images

    frames = await asyncio.get_event_loop().run_in_executor(None, run_ltx)

    # Export to mp4
    import tempfile
    import imageio
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    imageio.mimsave(tmp_path, [np.array(f) for f in frames], fps=24, quality=8)

    # Upload to fal
    filename = f"local-video-{uuid.uuid4().hex[:8]}.mp4"
    video_url = await upload_video_to_fal(tmp_path, filename)
    os.unlink(tmp_path)

    latency = int((time.perf_counter() - t0) * 1000)
    log.info(f"generate-video: {latency}ms on {DEVICE}")

    return GenerateVideoResponse(video_url=video_url, latency_ms=latency, device=DEVICE)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("INFERENCE_PORT", "8765"))
    log.info(f"Starting local inference server on port {port} (device={DEVICE})")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
