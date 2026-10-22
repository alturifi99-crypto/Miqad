BEGIN;
-- The definer must read identity metadata under FORCE RLS without BYPASSRLS.
-- miqad_auth already has narrowly scoped metadata policies; it owns no tenant data tables.
DO $$ BEGIN EXECUTE format('GRANT miqad_app,miqad_auth,miqad_platform TO %I',current_user); END $$;
GRANT CREATE ON SCHEMA public TO miqad_auth;
ALTER FUNCTION miqad_can(uuid,text[]) OWNER TO miqad_auth;
REVOKE CREATE ON SCHEMA public FROM miqad_auth;
REVOKE ALL ON FUNCTION miqad_can(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION miqad_can(uuid,text[]) TO miqad_app;
INSERT INTO schema_migrations(version) VALUES('004_managed_policy_owner');
COMMIT;
