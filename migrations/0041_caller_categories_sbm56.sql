-- SBM-56: additional Contacts Type values (vendor, supplier, transporter,
-- tech, relative). callers.category is free-text at the DB layer and
-- code-enforced via CALLER_CATEGORIES — no column change required.
-- This migration documents the expanded set for applied-migration history.

SELECT 1;
