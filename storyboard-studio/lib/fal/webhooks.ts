function normalizeAppUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  return url.replace(/\/$/, "");
}

export function getAppUrl(): string | null {
  return normalizeAppUrl(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
  );
}

export function canUseFalWebhooks(): boolean {
  const appUrl = getAppUrl();

  if (!appUrl) {
    return false;
  }

  try {
    const parsed = new URL(appUrl);
    const hostname = parsed.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0"
    ) {
      return false;
    }

    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildFalWebhookUrl(path: string): string | undefined {
  const appUrl = getAppUrl();
  if (!appUrl || !canUseFalWebhooks()) {
    return undefined;
  }

  return `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
