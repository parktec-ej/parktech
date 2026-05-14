import iconv from "iconv-lite";

export const SCRAPER_USER_AGENT =
  "ParkTechBot/1.0 (+https://parktec-ej.com; contact: info@parktec-ej.com)";

/**
 * Polite delay between requests. The spec requires >= 1s.
 */
export async function politeWait(ms = 1500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL, return body bytes. No automatic decoding.
 */
export async function fetchBytes(url: string, timeoutMs = 15000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        "Accept-Language": "ja",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`fetch failed: ${res.status} ${res.statusText} (${url})`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch an EUC-JP HTML page and return decoded UTF-8 string.
 */
export async function fetchEucJpHtml(url: string): Promise<string> {
  const buf = await fetchBytes(url);
  return iconv.decode(buf, "EUC-JP");
}
