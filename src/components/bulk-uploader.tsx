"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { messages, type Locale } from "@/lib/i18n";
import { MAX_PHOTO_BYTES } from "@/lib/events/schema";
import { Icon } from "./icon";
type Stage =
  | "ready"
  | "hashing"
  | "uploading"
  | "verifying"
  | "done"
  | "failed"
  | "needsFile";
type Row = {
  id: string;
  name: string;
  size: number;
  modified: number;
  stage: Stage;
  progress: number;
  error?: string;
  file?: File;
};
const storedRows = z
  .array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1).max(255),
      size: z.number().int().min(0).max(MAX_PHOTO_BYTES),
      modified: z.number(),
      stage: z.enum([
        "ready",
        "hashing",
        "uploading",
        "verifying",
        "done",
        "failed",
        "needsFile",
      ]),
    }),
  )
  .max(10000);
class UploadError extends Error {
  constructor(
    public code: string,
    public retryable = false,
  ) {
    super(code);
  }
}
async function post(url: string, body: unknown, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    throw new UploadError("network", true);
  }
  const value = await response.json().catch(() => ({ error: "network" }));
  if (!response.ok)
    throw new UploadError(
      value.error || "network",
      response.status >= 500 && value.error !== "setup",
    );
  return value;
}
function transfer(
  url: string,
  file: File,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open("PUT", url);
    xhr.timeout = 180000;
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader(
      "apikey",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    let last = 0;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && Date.now() - last > 200) {
        last = Date.now();
        progress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () =>
      finish(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new UploadError(
              "storageError",
              xhr.status >= 500 || xhr.status === 409 || xhr.status === 400,
            ),
      );
    xhr.onerror = () => finish(new UploadError("network", true));
    xhr.ontimeout = () => finish(new UploadError("network", true));
    xhr.onabort = () => finish(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      finish(new DOMException("Aborted", "AbortError"));
      return;
    }
    xhr.send(file);
  });
}
function backoff(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
export function BulkUploader({
  locale,
  eventId,
  ownerId,
}: {
  locale: Locale;
  eventId: string;
  ownerId: string;
}) {
  const t = messages[locale].phase2;
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [page, setPage] = useState(0);
  const control = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hashQueue = useRef<Promise<void>>(Promise.resolve());
  const storageKey = `snapmatch:uploads:v1:${ownerId}:${eventId}`;
  function replace(next: Row[]) {
    rowsRef.current = next;
    setRows(next);
  }
  function patch(id: string, changes: Partial<Row>) {
    const next = rowsRef.current.map((row) =>
      row.id === id ? { ...row, ...changes } : row,
    );
    rowsRef.current = next;
    setRows(next);
  }
  // Restore a browser-only external store after SSR. This effect runs once per
  // owner/event; restoring saved queue state intentionally causes one render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    function persist() {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(
            rowsRef.current.map(({ id, name, size, modified, stage }) => ({
              id,
              name,
              size,
              modified,
              stage,
            })),
          ),
        );
      } catch {
        setStorageError(true);
      }
    }
    try {
      const saved = storedRows.safeParse(
        JSON.parse(localStorage.getItem(storageKey) || "[]"),
      );
      if (saved.success) {
        const next = saved.data.map((row) => ({
          ...row,
          stage: (row.stage === "done" ? "done" : "needsFile") as Stage,
          progress: row.stage === "done" ? 100 : 0,
        }));
        rowsRef.current = next;
        setRows(next);
      }
    } catch {
      setStorageError(true);
    }
    const timer = setInterval(persist, 2000);
    const leaving = (event: BeforeUnloadEvent) => {
      persist();
      if (control.current && !control.current.signal.aborted)
        event.preventDefault();
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      persist();
      control.current?.abort();
      clearInterval(timer);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function choose(files: FileList | File[]) {
    if (control.current && !control.current.signal.aborted) return;
    const next = [...rowsRef.current];
    for (const file of Array.from(files)) {
      if (next.length >= 10000) break;
      if (
        file.size < 3 ||
        file.size > MAX_PHOTO_BYTES ||
        file.name.length > 255 ||
        !/\.jpe?g$/i.test(file.name)
      ) {
        next.push({
          id: crypto.randomUUID(),
          name: file.name.slice(0, 255) || "JPEG",
          size: Math.min(file.size, MAX_PHOTO_BYTES),
          modified: file.lastModified,
          stage: "failed",
          progress: 0,
          error: "invalidJpeg",
        });
        continue;
      }
      const index = next.findIndex(
        (row) =>
          row.name === file.name &&
          row.size === file.size &&
          row.modified === file.lastModified,
      );
      const row = {
        id: index < 0 ? crypto.randomUUID() : next[index].id,
        name: file.name,
        size: file.size,
        modified: file.lastModified,
        file,
        stage: "ready" as Stage,
        progress: 0,
      };
      if (index >= 0) next[index] = row;
      else next.push(row);
    }
    replace(next);
    setPage(0);
  }
  async function process(row: Row, signal: AbortSignal) {
    const file = row.file!;
    try {
      patch(row.id, { stage: "hashing", progress: 0, error: undefined });
      const bytes = new Uint8Array(await file.slice(0, 3).arrayBuffer());
      if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
        throw new UploadError("invalidJpeg");
      // Read one full file at a time so four large uploads do not duplicate 200 MB
      // of hashing buffers. Uploads still run in parallel after fingerprinting.
      const hashing = hashQueue.current.then(async () => {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        return crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      });
      hashQueue.current = hashing.then(
        () => {},
        () => {},
      );
      const digest = await hashing;
      const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const base = `/api/events/${eventId}/uploads`;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        try {
          const reservation = await post(
            base,
            {
              upload_key: fingerprint,
              original_filename: file.name,
              bytes: file.size,
            },
            signal,
          );
          if (!reservation.complete) {
            if (!reservation.present) {
              patch(row.id, { stage: "uploading", progress: 0 });
              await transfer(reservation.signedUrl, file, signal, (value) =>
                patch(row.id, { progress: value }),
              );
            }
            patch(row.id, { stage: "verifying", progress: 100 });
            await post(`${base}/${reservation.photoId}/complete`, {}, signal);
          }
          patch(row.id, { stage: "done", progress: 100 });
          return;
        } catch (error) {
          if (error instanceof UploadError && error.retryable && attempt < 2) {
            await backoff(1000 * 2 ** attempt, signal);
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (signal.aborted) patch(row.id, { stage: "ready", progress: 0 });
      else
        patch(row.id, {
          stage: "failed",
          progress: 0,
          error: error instanceof UploadError ? error.code : "network",
        });
    }
  }
  async function start() {
    if (control.current && !control.current.signal.aborted) return;
    const ready = rowsRef.current.filter(
      (row) => row.file && (row.stage === "ready" || row.stage === "failed"),
    );
    if (!ready.length) return;
    const controller = new AbortController();
    control.current = controller;
    setRunning(true);
    let index = 0;
    async function worker() {
      while (index < ready.length && !controller.signal.aborted) {
        const row = ready[index++];
        await process(row, controller.signal);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, ready.length) }, () => worker()),
    );
    if (control.current === controller) {
      control.current = null;
      setRunning(false);
      router.refresh();
    }
  }
  const done = rows.filter((row) => row.stage === "done").length;
  const failed = rows.filter((row) => row.stage === "failed").length;
  const ready = rows.some(
    (row) => row.file && (row.stage === "ready" || row.stage === "failed"),
  );
  const labels: Record<Stage, string> = {
    ready: t.ready,
    hashing: t.hashing,
    uploading: t.uploading,
    verifying: t.verifying,
    done: t.received,
    failed: t.failed,
    needsFile: t.reselect,
  };
  return (
    <section className="card bulk-uploader">
      <div className="upload-heading">
        <div>
          <h2>{t.uploadTitle}</h2>
          <p className="muted">{t.uploadHelp}</p>
        </div>
        <span className="version-badge">{t.parallel}</span>
      </div>
      <div
        className={drag ? "drop-zone drag" : "drop-zone"}
        onDragOver={(event) => {
          event.preventDefault();
          if (!running) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          if (!running) choose(event.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={30} />
        <strong>{t.drop}</strong>
        <p>{t.fileLimit}</p>
        <button
          className="button button-secondary"
          disabled={running}
          onClick={() => input.current?.click()}
        >
          {t.choose}
        </button>
        <input
          ref={input}
          className="hidden-file"
          type="file"
          multiple
          accept="image/jpeg,.jpg,.jpeg"
          onChange={(event) => {
            if (event.target.files) choose(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <p className="upload-resume-help">{t.resumeHelp}</p>
      {storageError && (
        <p className="notice" role="status">
          {t.storageUnavailable}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="upload-toolbar">
            <p aria-live="polite">
              {done} / {rows.length} {t.received} · {failed} {t.failed}
            </p>
            <div>
              {running ? (
                <button
                  className="button button-secondary"
                  onClick={() => control.current?.abort()}
                >
                  {t.pause}
                </button>
              ) : (
                <button className="button" disabled={!ready} onClick={start}>
                  {failed ? t.retry : t.start}
                </button>
              )}
              <button
                className="small-button"
                disabled={running}
                onClick={() => {
                  replace([]);
                  setPage(0);
                  try {
                    localStorage.removeItem(storageKey);
                  } catch {}
                }}
              >
                {t.clear}
              </button>
            </div>
          </div>
          <div className="queue-table">
            <table>
              <thead>
                <tr>
                  <th>{t.filename}</th>
                  <th>{t.progress}</th>
                  <th>{t.uploadStatus}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 50, page * 50 + 50).map((row) => (
                  <tr key={row.id}>
                    <td title={row.name}>{row.name}</td>
                    <td>
                      <progress
                        aria-label={`${t.progress}: ${row.name}`}
                        value={row.progress}
                        max={100}
                      />
                      <small>{row.progress}%</small>
                    </td>
                    <td>
                      <span className={`queue-stage ${row.stage}`}>
                        {labels[row.stage]}
                      </span>
                      {row.error && (
                        <small className="form-error">
                          {(t.uploadErrors as Record<string, string>)[
                            row.error
                          ] || t.uploadErrors.network}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="queue-pages">
            <button
              className="small-button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              {t.previous}
            </button>
            <span>
              {page + 1} / {Math.ceil(rows.length / 50)}
            </span>
            <button
              className="small-button"
              disabled={(page + 1) * 50 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              {t.next}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
