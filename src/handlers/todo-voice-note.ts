// POST /api/todos/:id/voice-note, GET /api/todo-voice-notes/:id — a quick
// raw-audio clip an admin attaches to one todo row from inside the Calls
// Needing Action carousel (migration 0025). Deliberately NOT routed through
// the Sarvam/Claude pipeline like site-voice-note.ts — these never get
// transcribed, so there's no `calls` row, no submitRecording, no waitUntil.
// Multiple notes per todo are allowed (append-only); getLatestVoiceNotesByTodoIds
// always returns the most recent one for playback.

import { addTodoVoiceNote, getTodoVoiceNoteById, isTodoAssignee, type SessionWithUser } from "@sbm/core";
import { streamR2Object } from "../lib/r2-stream";
import type { Env } from "../index";

const TODO_VOICE_NOTE_PREFIX = "todo-voice-notes/";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function extOf(file: File): string {
  return file.name.includes(".") ? file.name.split(".").pop()! : "m4a";
}

export async function handlePostTodoVoiceNote(request: Request, env: Env, todoId: string, uploadedByUserId: string): Promise<Response> {
  const form = await request.formData();
  const file = form.get("recording");
  if (!(file instanceof File)) return json({ error: "Missing 'recording' file" }, 400);

  const r2Key = `${TODO_VOICE_NOTE_PREFIX}${todoId}/${crypto.randomUUID()}.${extOf(file)}`;
  await env.RECORDINGS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const note = await addTodoVoiceNote(env.DB, {
    todoId,
    r2Key,
    contentType: file.type || "application/octet-stream",
    durationS: null,
    uploadedByUserId,
  });

  return json(note, 201);
}

/** Session-gated; staff may only stream a note on a todo they're assigned to. */
export async function handleGetTodoVoiceNote(
  request: Request,
  env: Env,
  id: string,
  session: SessionWithUser
): Promise<Response> {
  const note = await getTodoVoiceNoteById(env.DB, id);
  if (!note) return new Response("Not found", { status: 404 });
  if (session.user_role === "staff" && !(await isTodoAssignee(env.DB, note.todo_id, session.user_id))) {
    return new Response("Forbidden", { status: 403 });
  }
  return streamR2Object(env.RECORDINGS, note.r2_key, note.content_type, request);
}
