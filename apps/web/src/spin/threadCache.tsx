// The last of each chat this browser saw, kept here (IndexedDB) so a chat of a sleeping workspace
// reads at once while it wakes. Its words never leave this browser or the workspace.
import type { OrchestrationV2ThreadProjection, ScopedThreadRef } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useEffect, useState } from "react";

import { useEnvironmentThread } from "../state/threads";

/** A chat as kept: its title and the words of its last messages. */
export interface CachedThread {
  readonly title: string;
  readonly messages: ReadonlyArray<{
    readonly id: string;
    readonly role: "user" | "assistant" | "system";
    readonly text: string;
    readonly at: string;
  }>;
}

/** How many of a chat's messages are kept: its end is what a person comes back to. */
export const KEPT_MESSAGES = 200;

/** toCached is what of a chat is kept: the title, and its last messages' words in order. */
export function toCached(projection: OrchestrationV2ThreadProjection): CachedThread {
  return {
    title: projection.thread.title,
    messages: projection.messages
      .filter((m) => m.text.trim() !== "")
      .slice(-KEPT_MESSAGES)
      .map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        at: DateTime.formatIso(m.createdAt),
      })),
  };
}

const keyOf = (ref: ScopedThreadRef) => `${ref.environmentId}/${ref.threadId}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("spinbox-threads", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("threads");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = act(db.transaction("threads", mode).objectStore("threads"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** The chat as last kept, or null: none kept, or storage this browser refuses. */
async function loadThread(key: string): Promise<CachedThread | null> {
  try {
    return ((await run("readonly", (s) => s.get(key))) as CachedThread | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * SpinboxThreadCacheWriter keeps the open chat as it changes, at most once a second: a streaming
 * answer changes it many times a second, and the last of it is what is wanted.
 */
export function SpinboxThreadCacheWriter({ threadRef }: { threadRef: ScopedThreadRef }) {
  const state = useEnvironmentThread(threadRef.environmentId, threadRef.threadId);
  const projection = Option.getOrNull(state.data);
  const key = keyOf(threadRef);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the chat to IndexedDB, outside React, after it settles
  useEffect(() => {
    if (projection === null) return;
    const timer = setTimeout(() => {
      // A browser that refuses storage keeps no cache: the chat still opens once it wakes.
      run("readwrite", (s) => s.put(toCached(projection), key)).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [projection, key]);
  return null;
}

/**
 * SpinboxCachedThread is a chat of a workspace that is waking: as this browser last saw it, read
 * only, until its server answers and the chat itself takes its place.
 */
export function SpinboxCachedThread({ threadRef }: { threadRef: ScopedThreadRef }) {
  const [cached, setCached] = useState<CachedThread | null | undefined>(undefined);
  const key = keyOf(threadRef);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the kept chat from IndexedDB, outside React, once per chat
  useEffect(() => {
    let current = true;
    void loadThread(key).then((c) => current && setCached(c));
    return () => {
      current = false;
    };
  }, [key]);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-4 scrollbar-gutter-both">
      <p role="status" className="pb-3 text-sm text-muted-foreground">
        {cached
          ? "Waking its workspace. This is the chat as you last saw it."
          : "Waking its workspace."}
      </p>
      {cached ? (
        <article aria-label={cached.title} className="mx-auto w-full max-w-3xl space-y-4">
          <h1 className="text-base font-medium">{cached.title}</h1>
          {cached.messages.map((m) => (
            <section key={m.id} aria-label={m.role === "user" ? "You" : "Agent"}>
              <p className="pb-1 text-xs text-muted-foreground">
                {m.role === "user" ? "You" : "Agent"}
              </p>
              <p className="whitespace-pre-wrap text-sm">{m.text}</p>
            </section>
          ))}
        </article>
      ) : null}
    </div>
  );
}
