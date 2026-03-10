import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

interface LtxWebhookPayloadSuccess {
  request_id: string;
  status: "OK";
  payload: {
    video: {
      url: string;
    };
  };
}

interface LtxWebhookPayloadError {
  request_id: string;
  status: "ERROR";
  payload?: { error?: string };
  error?: string;
}

type LtxWebhookPayload = LtxWebhookPayloadSuccess | LtxWebhookPayloadError;

/**
 * POST handler for LTX-Video completion webhook.
 * fal fires this when an LTX job completes or fails.
 *
 * On success: fire studio/ltx.complete so the waiting generate-preview
 *   workflow can resume and save the draft video URL.
 *
 * On error: look up the Scene by ltxRequestId, mark PREVIEW_FAILED,
 *   and fire studio/ltx.failed to unblock any waiting workflows.
 *
 * Always returns 200 — fal retries on non-2xx.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LtxWebhookPayload;
    const { request_id, status } = body;

    if (!request_id) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (status === "OK" && "payload" in body && body.payload?.video?.url) {
      const videoUrl = body.payload.video.url;

      // Fire completion event — generate-preview workflow is waiting for this
      await inngest.send({
        name: "studio/ltx.complete",
        data: {
          ltxRequestId: request_id,
          videoUrl,
        },
      });
    } else {
      // Error — find the scene and mark preview failed
      const scene = await prisma.scene.findFirst({
        where: { ltxRequestId: request_id },
        select: { id: true },
      });

      const errorMessage =
        "payload" in body && body.payload && "error" in body.payload
          ? body.payload.error
          : (body as LtxWebhookPayloadError).error ?? "Unknown LTX error";

      console.error(
        `LTX webhook error for request ${request_id}${scene ? ` (scene ${scene.id})` : ""}:`,
        errorMessage
      );

      if (scene) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { status: "PREVIEW_FAILED", ltxRequestId: null },
        });
      }

      // Fire failure event to unblock any waiting generate-preview workflows
      await inngest.send({
        name: "studio/ltx.failed",
        data: { ltxRequestId: request_id },
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("LTX webhook handler error:", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
