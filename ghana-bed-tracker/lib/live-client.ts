"use client";

/**
 * Single shared EventSource for the whole browser tab.
 *
 * Every live component subscribes to the same store, so opening ten widgets
 * costs one connection. Snapshots are exposed through a monotonically
 * increasing version counter, which keeps `useSyncExternalStore` happy.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { AlertEvent, Facility, NationalSummary, StreamMessage, Ward } from "./types";

interface LiveState {
  connected: boolean;
  summary: NationalSummary | null;
  facilities: Record<string, Facility>;
  wards: Record<string, Ward[]>;
  alerts: AlertEvent[];
  updatedAt: number;
  lastEventKind: string | null;
  error: string | null;
}

const MAX_ALERTS = 40;

const state: LiveState = {
  connected: false,
  summary: null,
  facilities: {},
  wards: {},
  alerts: [],
  updatedAt: 0,
  lastEventKind: null,
  error: null,
};

let version = 0;
const listeners = new Set<() => void>();
let source: EventSource | null = null;
let subscribers = 0;

function bump() {
  version += 1;
  state.updatedAt = Date.now();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function handle(msg: StreamMessage) {
  state.lastEventKind = msg.kind;
  switch (msg.kind) {
    case "summary":
      state.summary = msg.summary;
      break;
    case "facility":
      state.facilities[msg.facility.id] = msg.facility;
      break;
    case "ward": {
      state.facilities[msg.facility.id] = msg.facility;
      const list = state.wards[msg.facility.id] ?? [];
      const idx = list.findIndex((w) => w.id === msg.ward.id);
      if (idx >= 0) list[idx] = msg.ward;
      else list.push(msg.ward);
      state.wards[msg.facility.id] = [...list];
      break;
    }
    case "alert": {
      const existing = state.alerts.some((a) => a.id === msg.alert.id && a.ts === msg.alert.ts);
      if (!existing) {
        state.alerts = [msg.alert as AlertEvent, ...state.alerts].slice(0, MAX_ALERTS);
      }
      break;
    }
    case "ping":
      break;
  }
  bump();
}

function connect() {
  if (source || typeof window === "undefined") return;
  try {
    source = new EventSource("/api/stream");
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    bump();
    return;
  }

  source.onopen = () => {
    state.connected = true;
    state.error = null;
    bump();
  };
  source.onerror = () => {
    state.connected = false;
    state.error = "Reconnecting to the live feed…";
    bump();
  };
  for (const kind of ["summary", "facility", "ward", "alert", "ping"]) {
    source.addEventListener(kind, (event) => {
      try {
        handle(JSON.parse((event as MessageEvent).data) as StreamMessage);
      } catch {
        /* ignore malformed frames */
      }
    });
  }
}

function disconnect() {
  if (source) {
    source.close();
    source = null;
  }
  state.connected = false;
}

/** Reference-counted connection: first hook opens it, last one closes it. */
export function useLive(): LiveState {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );

  useEffect(() => {
    subscribers += 1;
    connect();
    return () => {
      subscribers -= 1;
      if (subscribers <= 0) {
        subscribers = 0;
        disconnect();
      }
    };
  }, []);

  return state;
}

/** Convenience: live facility state merged over a server-rendered snapshot. */
export function useLiveFacility(facilityId: string, fallback: Facility): Facility {
  const live = useLive();
  return live.facilities[facilityId] ?? fallback;
}

export function useLiveWards(facilityId: string, fallback: Ward[]): Ward[] {
  const live = useLive();
  return live.wards[facilityId]?.length ? live.wards[facilityId] : fallback;
}

export function liveSnapshot(): LiveState {
  return state;
}
