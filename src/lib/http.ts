const UA =
  "Stromtarif-Agent/1.0 (privater Haushaltsvergleich Ippesheimer Weg 24, 55545 Bad Kreuznach)";

export async function fetchText(
  url: string,
  timeoutMs = 18000,
): Promise<{ ok: true; text: string; status: number } | { ok: false; error: string; status?: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        },
        cache: "no-store",
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          return { ok: false, error: `HTTP ${res.status} ohne Location`, status: res.status };
        }
        current = new URL(location, current).toString();
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}`, status: res.status };
      }
      return { ok: true, text, status: res.status };
    }
    return { ok: false, error: "Zu viele Redirects" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 18000) {
  const res = await fetchText(url, timeoutMs);
  if (!res.ok) return res;
  try {
    return { ok: true as const, data: JSON.parse(res.text) as T, status: res.status };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&euro;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
}
