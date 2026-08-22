-- Ensure statement timeout is 10 minutes for all connections
-- This prevents "canceling statement due to statement timeout" on large payroll runs
ALTER DATABASE postgres SET statement_timeout = '10min';
ALTER ROLE authenticator SET statement_timeout = '10min';
ALTER ROLE authenticated SET statement_timeout = '10min';
