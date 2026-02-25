import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FAL_API_BASE = "https://rest.alpha.fal.ai";
const FAL_STORAGE_BASE = "https://rest.alpha.fal.ai/storage";

/**
 * Generate a presigned upload URL from fal.ai.
 * Returns { upload_url, file_url } (file_url = the CDN URL after upload).
 */
async function handleInitiateUpload(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const { file_name, content_type } = body as {
    file_name: string;
    content_type: string;
  };

  const falResp = await fetch(`${FAL_STORAGE_BASE}/upload/initiate`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name,
      content_type,
    }),
  });

  if (!falResp.ok) {
    const text = await falResp.text();
    console.error("[fal-proxy] initiate upload failed:", falResp.status, text);
    return NextResponse.json(
      { error: "Failed to initiate upload", detail: text },
      { status: falResp.status }
    );
  }

  const data = await falResp.json();
  return NextResponse.json(data);
}

/**
 * Proxy generic requests to fal.ai's REST API, injecting FAL_KEY.
 */
async function proxyToFal(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const targetPath = path.join("/");

  // Intercept storage upload initiations
  if (targetPath === "storage/upload/initiate") {
    return handleInitiateUpload(req);
  }

  const targetUrl = new URL(`/${targetPath}`, FAL_API_BASE);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers();
  headers.set("Authorization", `Key ${process.env.FAL_KEY}`);
  headers.set("Accept", req.headers.get("Accept") ?? "application/json");

  const contentType = req.headers.get("Content-Type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  // Forward x-fal-* headers
  req.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("x-fal-")) {
      headers.set(key, value);
    }
  });

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.blob()
      : undefined;

  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
    });

    const responseBody = await response.arrayBuffer();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Proxy request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return proxyToFal(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return proxyToFal(req, ctx);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return proxyToFal(req, ctx);
}
