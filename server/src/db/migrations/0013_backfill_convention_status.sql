-- Custom SQL migration file, put your code below! --
-- Carry the legacy boolean into the new status column before 0014 drops `accepted`.
UPDATE "conventions" SET "status" = 'accepted' WHERE "accepted";
