-- Calls page filtering/pagination (queries.ts listCallsPage/countCallsMatching)
-- runs an indexed WHERE + ORDER BY on every request — date range, caller,
-- call_type, and a todos EXISTS check, plus a keyset cursor seek on
-- (recorded_at, id). None of those columns had an index, so every one of
-- those queries was a full table scan. Harmless at today's call volume;
-- becomes the actual scaling limit (not subrequest count, not row count in
-- a response — query cost) as the calls table grows over months/years of
-- real use. This is the permanent fix for that, independent of whichever
-- pagination model the UI uses.

CREATE INDEX idx_calls_recorded_at ON calls(recorded_at DESC, id DESC);
CREATE INDEX idx_calls_recording_date ON calls(recording_date);
CREATE INDEX idx_calls_call_type ON calls(call_type);
CREATE INDEX idx_todos_call_id ON todos(call_id);
