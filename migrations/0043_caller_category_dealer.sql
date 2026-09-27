-- SBM-56: add Dealer to Contacts Type. callers.category is free-text at the
-- DB layer and code-enforced via CALLER_CATEGORIES — no column change required.
-- This migration documents the expanded set for applied-migration history.
-- Numbered 0043 because 0042 is taken by develop-phase-2 (production/warehouse).

SELECT 1;
