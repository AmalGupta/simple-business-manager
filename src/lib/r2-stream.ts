// Shared Range-aware R2 streaming — used by both site-media.ts (photos/
// videos) and the call-recording playback route. <audio>/<video> elements
// issue Range requests for scrubbing by default and some browsers won't
// play at all without a 206 response, so this isn't optional polish.

const RANGE_RE = /^bytes=(\d+)-(\d*)$/;

/**
 * `contentType` is optional — when omitted (the call-recording route, which
 * has nowhere to store it per-row), falls back to whatever was set on the
 * object at upload time (`httpMetadata.contentType`, see upload.ts), then
 * finally a generic default.
 */
export async function streamR2Object(
  bucket: R2Bucket,
  r2Key: string,
  contentType: string | undefined,
  request: Request
): Promise<Response> {
  const rangeHeader = request.headers.get("Range");
  const rangeMatch = rangeHeader?.match(RANGE_RE);

  if (!rangeMatch) {
    const object = await bucket.get(r2Key);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      status: 200,
      headers: {
        "content-type": contentType ?? object.httpMetadata?.contentType ?? "application/octet-stream",
        "content-length": String(object.size),
        "accept-ranges": "bytes",
      },
    });
  }

  const head = await bucket.head(r2Key);
  if (!head) return new Response("Not found", { status: 404 });
  const resolvedContentType = contentType ?? head.httpMetadata?.contentType ?? "application/octet-stream";

  const start = Number(rangeMatch[1]);
  const end = rangeMatch[2] ? Number(rangeMatch[2]) : head.size - 1;
  if (start >= head.size || end >= head.size || start > end) {
    return new Response("Range not satisfiable", { status: 416, headers: { "content-range": `bytes */${head.size}` } });
  }

  const object = await bucket.get(r2Key, { range: { offset: start, length: end - start + 1 } });
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    status: 206,
    headers: {
      "content-type": resolvedContentType,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${head.size}`,
      "accept-ranges": "bytes",
    },
  });
}
