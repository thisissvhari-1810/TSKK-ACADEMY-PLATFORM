-- Normalize student codes: TSKK-00002 -> TSKK-0002, TSKK-00003 -> TSKK-0003, etc.
-- Any code shaped as TSKK-0<4 more digits> gets one leading zero stripped so
-- the whole cohort uses a consistent 4-digit width (TSKK-0001, TSKK-0002, …).
BEGIN;
UPDATE students
SET "studentCode" = 'TSKK-' || substring("studentCode" from 7)
WHERE "studentCode" ~ '^TSKK-0[0-9]{4}$';
COMMIT;
