/* ------------------------------------------------------------------
   Audio playback — voice notes and site memos. Thin native <audio>
   wrapper, no custom scrubber; the browser issues Range requests against
   the streaming endpoint (see src/lib/r2-stream.ts) for seeking.
   ------------------------------------------------------------------ */
export function AudioPlayer({ src }) {
  return (
    <audio controls src={src} style={{ width: "100%", height: 36, marginTop: 6 }}>
      Your browser can't play this audio.
    </audio>
  );
}
