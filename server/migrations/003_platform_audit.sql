BEGIN;
CREATE TABLE platform_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),tenant_id uuid NOT NULL REFERENCES tenants(id),action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;ALTER TABLE platform_audit_logs FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON platform_audit_logs TO miqad_platform;
CREATE POLICY platform_audit_read ON platform_audit_logs FOR SELECT TO miqad_platform USING(true);
CREATE POLICY platform_audit_insert ON platform_audit_logs FOR INSERT TO miqad_platform WITH CHECK(user_id=miqad_user());
INSERT INTO schema_migrations(version) VALUES('003_platform_audit');
COMMIT;
