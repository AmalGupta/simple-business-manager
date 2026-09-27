-- SBM-69: Contacts Type list becomes Client, Supplier, Transporter,
-- Office Staff, Service Staff, Family, Relative, Franchisee, Sales Associate,
-- Brand Associate, Builder / Project, Architect (spam stays as a system
-- category behind Mark as spam). callers.category is free text, code-enforced
-- via CALLER_CATEGORIES, so this only remaps existing rows.

-- Staff splits in two. Kashish (staff login KASHISH) is Office Staff —
-- matched on the linked login, not the contact name, since several client
-- contacts are also called Kashish. Every other staff contact is Service Staff.
UPDATE callers SET category = 'office_staff'
WHERE category = 'staff'
  AND staff_user_id IN (SELECT id FROM users WHERE role = 'staff' AND upper(trim(name)) = 'KASHISH');
UPDATE callers SET category = 'service_staff' WHERE category = 'staff';

-- On UAT the KASHISH login has no linked contact; her number only exists as
-- phone-only client rows. Link those (last-10-digit phone match) so she shows
-- on the Staff bookmark as Office Staff.
UPDATE callers
SET category = 'office_staff',
    staff_user_id = (SELECT id FROM users WHERE role = 'staff' AND upper(trim(name)) = 'KASHISH')
WHERE staff_user_id IS NULL
  AND category = 'client'
  AND phone IS NOT NULL
  AND substr(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), -10) = (
    SELECT substr(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), -10)
    FROM users
    WHERE role = 'staff' AND upper(trim(name)) = 'KASHISH' AND phone IS NOT NULL AND length(trim(phone)) >= 10
  );

-- Retired types fold into Supplier.
UPDATE callers SET category = 'supplier' WHERE category IN ('vendor', 'dealer', 'tech');

-- family / relative / client / transporter / spam are unchanged.
