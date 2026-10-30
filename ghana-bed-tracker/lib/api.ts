/** Small helpers shared by the API route handlers. */
import { NextResponse } from "next/server";
import { HttpError } from "./auth";

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function fail(err: unknown): NextResponse {
  if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[api]", err);
  return json({ error: message }, { status: 500 });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function intParam(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function boolParam(value: string | null): boolean {
  return value === "1" || value === "true" || value === "yes";
}

/** Route handlers must never be statically cached. */
export const dynamic = "force-dynamic";
