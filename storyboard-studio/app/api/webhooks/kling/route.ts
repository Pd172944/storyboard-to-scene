import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

interface KlingWebhookPayload {
  request_id: string;
  status: string;
  payload?: {
    video?: {
      url: string;
    };
  };
  error?: string;
}

/**
 * POST handler for Kling completion webhook.
 * Fired by fal.ai when a Kling video generation job completes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as KlingWebhookPayload;
    const { request_id, status, payload } = body;

    if (!request_id) {
      return NextResponse.json(
        { error: "Missing request_id" },
        { status: 400 }
      );
    }

    // fal.ai sends status "OK" on completion
    if (status === "OK" && payload?.video?.url) {
      await inngest.send({
        name: "studio/kling.complete",
        data: {
          klingRequestId: request_id,
          videoUrl: payload.video.url,
        },
      });
    } else if (status === "ERROR" || body.error) {
      // Optionally handle errors — the Inngest waitForEvent will timeout
      console.error(
        `Kling webhook error for ${request_id}:`,
        body.error ?? "Unknown error"
      );
    }

    // Always respond 200 to prevent fal retries
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Kling webhook handler error:", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
