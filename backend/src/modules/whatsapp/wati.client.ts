import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

/** WATI network timeout. WATI's first call can be slow; keep this generous to avoid
 *  aborting a request that actually delivered (which would otherwise look like a failure). */
const TIMEOUT_MS = 30_000;

export type WatiResponse = { ok: boolean; status: number; body: unknown };
export type WatiTemplateParam = { name: string; value: string };

/**
 * Thrown when we never got a response from WATI (timeout / network). The message MAY still
 * have been delivered — callers must treat this as "unconfirmed", never as "definitely failed".
 */
export class WatiUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatiUnreachableError";
  }
}

function baseUrl(): string {
  return env.WATI_BASE_URL.replace(/\/$/, "");
}

/** WATI's dashboard shows the token already prefixed with "Bearer "; tolerate both. */
function authHeader(): string {
  const t = env.WATI_ACCESS_TOKEN.trim();
  return /^bearer\s/i.test(t) ? t : `Bearer ${t}`;
}

async function watiFetch(path: string, init: RequestInit): Promise<WatiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    // Timeout or network failure — we did NOT receive a response, so delivery is unknown.
    if (controller.signal.aborted) {
      throw new WatiUnreachableError(`WATI request timed out after ${TIMEOUT_MS}ms`);
    }
    throw new WatiUnreachableError(err instanceof Error ? err.message : "WATI request failed");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send an approved WATI template to a number.
 * `POST {base}/api/v1/sendTemplateMessage?whatsappNumber=<phone>`
 */
export async function sendTemplateMessage(input: {
  phone: string;
  templateName: string;
  broadcastName: string;
  parameters: WatiTemplateParam[];
}): Promise<WatiResponse> {
  const qs = new URLSearchParams({ whatsappNumber: input.phone });
  return watiFetch(`/api/v1/sendTemplateMessage?${qs.toString()}`, {
    method: "POST",
    body: JSON.stringify({
      template_name: input.templateName,
      broadcast_name: input.broadcastName,
      parameters: input.parameters,
    }),
  });
}

/**
 * Ensure the contact exists before sending. Best-effort and non-fatal: WATI may
 * auto-create on send, so a failure here should never block the template message.
 */
export async function addContact(input: {
  phone: string;
  name?: string | null;
}): Promise<void> {
  try {
    await watiFetch(`/api/v1/addContact/${encodeURIComponent(input.phone)}`, {
      method: "POST",
      body: JSON.stringify(input.name ? { name: input.name } : {}),
    });
  } catch (err) {
    logger.warn({ err, phone: input.phone }, "WATI addContact failed (non-fatal)");
  }
}
