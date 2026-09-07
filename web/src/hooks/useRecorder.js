import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Mic capture, extracted from VoiceNoteModal.

   The recorder used to live inside that dialog, which meant anything
   wanting to record also inherited the overlay. The site mic button
   needs the capture without the chrome, so the state machine moved
   here and the dialog became one consumer of it.
   ------------------------------------------------------------------ */

/* Safari only reliably does audio/mp4; Chrome and Firefox prefer opus.
   Probing in preference order and passing "" (browser default) as the
   last resort is what makes one recorder work across all three. */
function pickRecorderMimeType() {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return "";
}

export function extensionForMimeType(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  return "m4a";
}

/**
 * @returns {{
 *   status: "idle" | "recording" | "recorded" | "saving",
 *   elapsedS: number,
 *   error: string,
 *   previewUrl: string | null,
 *   start: () => Promise<void>,
 *   stop: () => void,
 *   reset: () => void,
 *   save: (onSave: (blob: Blob, fileName: string) => Promise<unknown>) => Promise<void>,
 * }}
 */
export function useRecorder() {
  const [status, setStatus] = useState("idle");
  const [elapsedS, setElapsedS] = useState(0);
  const [error, setError] = useState("");
  // Held in state, not a ref, so the preview re-renders when it lands —
  // the old ref-based version relied on the status change to repaint.
  const [previewUrl, setPreviewUrl] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const previewUrlRef = useRef(null);
  const timerRef = useRef(null);

  const releaseStream = useCallback(() => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const start = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/mp4" });
        blobRef.current = blob;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = URL.createObjectURL(blob);
        setPreviewUrl(previewUrlRef.current);
        setStatus("recorded");
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
      setElapsedS(0);
      timerRef.current = setInterval(() => setElapsedS((s) => s + 1), 1000);
    } catch (err) {
      console.error("[sbm] mic access failed", err);
      setError("Couldn't access the microphone — check permissions.");
    }
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    releaseStream();
  }, [releaseStream]);

  const reset = useCallback(() => {
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
    blobRef.current = null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setElapsedS(0);
    setError("");
    setStatus("idle");
  }, [releaseStream]);

  /* Takes the upload function rather than owning an endpoint — a
     recording goes to a site, a todo, or a not-yet-created site
     depending on the caller. */
  const save = useCallback(async (onSave) => {
    if (!blobRef.current) return;
    setStatus("saving");
    setError("");
    try {
      const ext = extensionForMimeType(blobRef.current.type);
      await onSave(blobRef.current, `voice-note.${ext}`);
    } catch (err) {
      console.error("[sbm] voice note upload failed", err);
      setError("Failed to save — try again.");
      setStatus("recorded");
      throw err;
    }
  }, []);

  return { status, elapsedS, error, previewUrl, start, stop, reset, save };
}
