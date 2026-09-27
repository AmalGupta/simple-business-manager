-- SBM-56: add Dealer and retire Supplier from Contacts Type. callers.category
-- is free-text at the DB layer and code-enforced via CALLER_CATEGORIES, so
-- adding Dealer needs no column change. Any contact still marked supplier
-- moves to vendor, since supplier is no longer an accepted value.
-- Numbered 0043 because 0042 is taken by develop-phase-2 (production/warehouse).

UPDATE callers SET category = 'vendor' WHERE category = 'supplier';
