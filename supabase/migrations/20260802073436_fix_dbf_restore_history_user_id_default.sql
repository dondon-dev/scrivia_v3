/*
# Fix dbf_restore_history user_id default

## Problem
The `dbf_restore_history` table was created with a `user_id` column that has no
database default. The frontend inserts restore records WITHOUT explicitly
passing `user_id`, leaving it null. The RLS INSERT policy checks
`auth.uid() = user_id`, which evaluates to false when `user_id` is null,
causing every restore confirm to fail with "new row violates row-level
security policy".

## Fix
Set the column default to `auth.uid()` so the authenticated user's ID is
populated automatically on insert, matching the mandatory pattern from the
bolt-database skill.
*/
ALTER TABLE dbf_restore_history
  ALTER COLUMN user_id SET DEFAULT auth.uid();
