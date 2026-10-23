import type { ApiErrorPayload } from "../types";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[2]) : null;
}

type CsrfKind = "access" | "refresh";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Objek biasa (bukan string): apiFetch yang melakukan JSON.stringify. */
  body?: Record<string, unknown>;
  csrf?: CsrfKind;
  signal?: AbortSignal;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!SAFE_METHODS.has(method)) {
    const cookieName =
      options.csrf === "refresh" ? "csrf_refresh_token" : "csrf_access_token";
    const csrf = readCookie(cookieName);
    if (csrf) {
      headers["X-CSRF-TOKEN"] = csrf;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    throw new ApiError(
      response.status,
      errorPayload?.error?.code ?? "http_error",
      errorPayload?.error?.message ?? `Permintaan gagal (${response.status})`,
      errorPayload?.error?.details,
    );
  }

  return payload as T;
}

/** Upload file (multipart/form-data) dengan header CSRF. */
export async function apiUpload<T>(
  path: string,
  file: File,
  field = "file",
): Promise<T> {
  const form = new FormData();
  form.append(field, file);

  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = readCookie("csrf_access_token");
  if (csrf) {
    headers["X-CSRF-TOKEN"] = csrf;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: form,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    throw new ApiError(
      response.status,
      errorPayload?.error?.code ?? "upload_failed",
      errorPayload?.error?.message ?? `Upload gagal (${response.status})`,
      errorPayload?.error?.details,
    );
  }

  return payload as T;
}
