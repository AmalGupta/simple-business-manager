export function AudioPlayer({ src }) {
  return (
    <audio controls src={src} style={{ width: "100%", height: 36, marginTop: 6 }}>
      Your browser can't play this audio.
    </audio>
  );
}
