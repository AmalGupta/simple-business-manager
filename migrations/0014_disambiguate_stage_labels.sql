-- D1 migration 0014 — the "Process Aluminium" catalog has two pipeline
-- points sharing the same plain-English name (frame-line QC vs shutter-line
-- QC; the frame payment vs the final payment). Found live while testing
-- migration 0013's "View work timeline" popup: both instances render
-- identically with no way to tell them apart at a glance. Fixing the label
-- text here rather than editing 0013 in place — 0013 already shipped and
-- ran against real data; this UPDATE is the correction on top of it, same
-- principle as never editing a shipped prompt version. Applied via:
-- wrangler d1 migrations apply sbm-dev --local|--remote

UPDATE workflow_stages SET label = 'Quality Control (Frames)' WHERE id = 'quality_control_frames';
UPDATE workflow_stages SET label = 'Quality Control (Shutter)' WHERE id = 'quality_control_shutter';
UPDATE workflow_stages SET label = 'Payment (Frames)' WHERE id = 'payment_frames';
UPDATE workflow_stages SET label = 'Payment (Final)' WHERE id = 'payment_final';
