/**
 * In-process pub/sub that backs the Server-Sent Events stream.
 *
 * Every browser tab subscribes once to `/api/stream`; ward updates, alerts and
 * national summaries are pushed to all listeners immediately. For a multi-node
 * deployment, swap this for Redis pub/sub — the `broadcast()` call sites are
 * the only integration point.
 */
import type { StreamMessage } from "./types";

type Listener = (msg: StreamMessage) => void;

const g = globalThis as unknown as {
  __ghanabedHub?: Set<Listener>;
  __ghanabedStarted?: boolean;
};

function hub(): Set<Listener> {
  if (!g.__ghanabedHub) g.__ghanabedHub = new Set<Listener>();
  return g.__ghanabedHub;
}

export function broadcast(msg: StreamMessage): void {
  for (const listener of hub()) {
    try {
      listener(msg);
    } catch {
      hub().delete(listener);
    }
  }
}

export function listenerCount(): number {
  return hub().size;
}

function encode(msg: StreamMessage, event?: string): string {
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(msg)}`);
  return `${lines.join("\n")}\n\n`;
}

/** Creates an SSE ReadableStream with a heartbeat to defeat proxy idling. */
export function createEventStream(initial?: StreamMessage[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let activeListener: Listener | undefined;

  const cleanup = () => {
    closed = true;
    if (timer) clearInterval(timer);
    if (activeListener) hub().delete(activeListener);
    activeListener = undefined;
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const listener: Listener = (msg) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encode(msg, msg.kind)));
        } catch {
          cleanup();
        }
      };
      activeListener = listener;
      hub().add(listener);

      controller.enqueue(
        encoder.encode(`retry: 3000\n${encode({ kind: "ping", ts: Date.now() })}`),
      );
      for (const msg of initial ?? []) controller.enqueue(encoder.encode(encode(msg, msg.kind)));

      timer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 20_000);
    },
    cancel() {
      cleanup();
    },
  });
}

export const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
