import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { setCharacterReelCache } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Type definitions for the fal webhook payload
// ---------------------------------------------------------------------------

interface WanWebhookPayloadSuccess {
  request_id: string;
  status: "OK";
  payload: {
    video: {
      url: string;
    };
  };
}

interface WanWebhookPayloadError {
  request_id: string;
  status: "ERROR";
  payload?: {
    error?: string;
  };
  error?: string;
}

type WanWebhookPayload = WanWebhookPayloadSuccess | WanWebhookPayloadError;

// ---------------------------------------------------------------------------
// POST handler for Wan R2V completion webhook
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WanWebhookPayload;
    const { request_id, status } = body;

    if (!request_id) {
      // Always return 200 — fal retries on non-2xx
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Map request_id back to projectId via the wanRequestId field
    const project = await prisma.project.findFirst({
      where: { wanRequestId: request_id },
      select: { id: true },
    });

    if (!project) {
      console.error(
        `Wan webhook: no project found for wanRequestId ${request_id}`
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const projectId = project.id;

    if (status === "OK" && "payload" in body && body.payload?.video?.url) {
      const reelUrl = body.payload.video.url;

      // 1. Update Postgres: reel URL + status COMPLETE, clear wanRequestId
      await prisma.project.update({
        where: { id: projectId },
        data: {
          characterReelUrl: reelUrl,
          characterReelStatus: "COMPLETE",
          wanRequestId: null,
        },
      });

      // 2. Cache the reel URL in Redis
      await setCharacterReelCache(projectId, reelUrl);

      // 3. Fire Inngest event so waiting workflows can continue
      await inngest.send({
        name: "studio/wan.complete",
        data: {
          wanRequestId: request_id,
          reelUrl,
          projectId,
        },
      });
    } else {
      // Error case
      const errorMessage =
        "payload" in body && body.payload && "error" in body.payload
          ? body.payload.error
          : (body as WanWebhookPayloadError).error ?? "Unknown error";

      console.error(
        `Wan webhook error for ${request_id} (project ${projectId}):`,
        errorMessage
      );

      // 1. Update Postgres: mark FAILED
      await prisma.project.update({
        where: { id: projectId },
        data: {
          characterReelStatus: "FAILED",
          wanRequestId: null,
        },
      });

      // 2. Fire failure event so waiting workflows can unblock
      await inngest.send({
        name: "studio/wan.failed",
        data: {
          wanRequestId: request_id,
          projectId,
        },
      });
    }

    // Always respond 200 to prevent fal retries
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Wan webhook handler error:", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
