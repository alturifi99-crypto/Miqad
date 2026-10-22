BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='miqad_app') THEN CREATE ROLE miqad_app LOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='miqad_auth') THEN CREATE ROLE miqad_auth LOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='miqad_platform') THEN CREATE ROLE miqad_platform LOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;
CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE NOT NULL,password_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tenants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS memberships(tenant_id uuid NOT NULL REFERENCES tenants(id),user_id uuid NOT NULL REFERENCES users(id),role text NOT NULL CHECK(role IN('owner','admin','organizer','reception','viewer')),active boolean NOT NULL DEFAULT true,PRIMARY KEY(tenant_id,user_id));
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS platform_admins(user_id uuid PRIMARY KEY REFERENCES users(id));
CREATE TABLE IF NOT EXISTS invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),email text NOT NULL,role text NOT NULL CHECK(role IN('admin','organizer','reception','viewer')),token_hash text UNIQUE NOT NULL,expires_at timestamptz NOT NULL,accepted_at timestamptz);
CREATE TABLE IF NOT EXISTS events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS halls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,UNIQUE(tenant_id,id));
CREATE TABLE IF NOT EXISTS workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid NOT NULL,hall_id uuid NOT NULL,name text NOT NULL,next_row_id integer NOT NULL DEFAULT 1,UNIQUE(tenant_id,event_id,id),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,event_id) REFERENCES events(tenant_id,id),FOREIGN KEY(tenant_id,hall_id) REFERENCES halls(tenant_id,id));
CREATE TABLE IF NOT EXISTS seating_rows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid NOT NULL,workspace_id uuid NOT NULL,legacy_id integer NOT NULL,name text NOT NULL,seat_count integer NOT NULL CHECK(seat_count BETWEEN 1 AND 100),UNIQUE(tenant_id,event_id,workspace_id,id),UNIQUE(tenant_id,workspace_id,legacy_id),FOREIGN KEY(tenant_id,event_id,workspace_id) REFERENCES workspaces(tenant_id,event_id,id));
CREATE TABLE IF NOT EXISTS seats(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid NOT NULL,workspace_id uuid NOT NULL,row_id uuid NOT NULL,number integer NOT NULL CHECK(number BETWEEN 1 AND 100),UNIQUE(tenant_id,event_id,workspace_id,id),UNIQUE(tenant_id,workspace_id,row_id,number),FOREIGN KEY(tenant_id,event_id,workspace_id,row_id) REFERENCES seating_rows(tenant_id,event_id,workspace_id,id));
CREATE TABLE IF NOT EXISTS guests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid NOT NULL,external_id text NOT NULL,name text NOT NULL,title text NOT NULL DEFAULT '',organization text NOT NULL DEFAULT '',companions text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',category text NOT NULL DEFAULT 'regular' CHECK(category IN('regular','vip')),source_record jsonb NOT NULL DEFAULT '{}',UNIQUE(tenant_id,event_id,id),UNIQUE(tenant_id,event_id,external_id),FOREIGN KEY(tenant_id,event_id) REFERENCES events(tenant_id,id));
CREATE TABLE IF NOT EXISTS reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid NOT NULL,workspace_id uuid NOT NULL,guest_id uuid NOT NULL,seat_id uuid NOT NULL,version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(tenant_id,event_id,guest_id) REFERENCES guests(tenant_id,event_id,id),FOREIGN KEY(tenant_id,event_id,workspace_id,seat_id) REFERENCES seats(tenant_id,event_id,workspace_id,id),
 CONSTRAINT one_guest_seat UNIQUE(tenant_id,event_id,guest_id) DEFERRABLE INITIALLY IMMEDIATE,CONSTRAINT one_seat_guest UNIQUE(tenant_id,event_id,seat_id) DEFERRABLE INITIALLY IMMEDIATE);
CREATE TABLE IF NOT EXISTS delegations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid NOT NULL,external_id text NOT NULL,name text NOT NULL,leader_id uuid NOT NULL,UNIQUE(tenant_id,event_id,id),UNIQUE(tenant_id,event_id,external_id),FOREIGN KEY(tenant_id,event_id,leader_id) REFERENCES guests(tenant_id,event_id,id),FOREIGN KEY(tenant_id,event_id) REFERENCES events(tenant_id,id));
CREATE TABLE IF NOT EXISTS delegation_members(tenant_id uuid NOT NULL,event_id uuid NOT NULL,delegation_id uuid NOT NULL,guest_id uuid NOT NULL,PRIMARY KEY(tenant_id,event_id,delegation_id,guest_id),UNIQUE(tenant_id,event_id,guest_id),FOREIGN KEY(tenant_id,event_id,delegation_id) REFERENCES delegations(tenant_id,event_id,id),FOREIGN KEY(tenant_id,event_id,guest_id) REFERENCES guests(tenant_id,event_id,id));
CREATE TABLE IF NOT EXISTS audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),user_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS import_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),content_hash text NOT NULL,workspace_id uuid NOT NULL,original_snapshot jsonb NOT NULL,UNIQUE(tenant_id,content_hash),FOREIGN KEY(tenant_id,workspace_id) REFERENCES workspaces(tenant_id,id));
CREATE TABLE IF NOT EXISTS plans(id text PRIMARY KEY,name text NOT NULL,limits jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS tenant_subscriptions(tenant_id uuid PRIMARY KEY REFERENCES tenants(id),plan_id text NOT NULL REFERENCES plans(id),status text NOT NULL CHECK(status IN('trial','active','suspended')),ends_at timestamptz);
INSERT INTO plans(id,name,limits) VALUES('foundation','مرحلة التأسيس','{}') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION miqad_user() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION miqad_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION miqad_can(t uuid,roles text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT t=public.miqad_tenant() AND EXISTS(SELECT 1 FROM public.memberships m JOIN public.tenants c ON c.id=m.tenant_id WHERE m.tenant_id=t AND m.user_id=public.miqad_user() AND m.active AND m.role=ANY(roles) AND c.status='active')
$$;
REVOKE ALL ON FUNCTION miqad_can(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION miqad_can(uuid,text[]) TO miqad_app;
GRANT USAGE ON SCHEMA public TO miqad_app,miqad_auth,miqad_platform;
GRANT SELECT,INSERT,UPDATE,DELETE ON users,sessions TO miqad_auth;
GRANT SELECT,INSERT,UPDATE ON tenants,memberships,invitations TO miqad_auth;
GRANT SELECT ON platform_admins TO miqad_auth;
GRANT SELECT,UPDATE ON tenants TO miqad_platform;
GRANT SELECT ON plans TO miqad_app;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY; ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_auth ON tenants TO miqad_auth USING(true) WITH CHECK(true);
CREATE POLICY tenants_platform ON tenants TO miqad_platform USING(true) WITH CHECK(true);
CREATE POLICY tenants_app ON tenants FOR SELECT TO miqad_app USING(miqad_can(id,ARRAY['owner','admin','organizer','reception','viewer']));
GRANT SELECT ON tenants TO miqad_app;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_auth ON memberships TO miqad_auth USING(true) WITH CHECK(true);
CREATE POLICY memberships_app ON memberships FOR SELECT TO miqad_app USING(tenant_id=miqad_tenant() AND user_id=miqad_user());
GRANT SELECT ON memberships TO miqad_app;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_auth ON invitations TO miqad_auth USING(true) WITH CHECK(true);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['events','halls','workspaces','seating_rows','seats','guests','reservations','delegations','delegation_members','audit_logs','import_batches','tenant_subscriptions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT TO miqad_app USING(miqad_can(tenant_id,ARRAY[''owner'',''admin'',''organizer'',''viewer'']))',tab);
  IF tab='audit_logs' THEN
   GRANT SELECT,INSERT ON audit_logs TO miqad_app;
   CREATE POLICY tenant_audit_insert ON audit_logs FOR INSERT TO miqad_app WITH CHECK(miqad_can(tenant_id,ARRAY['owner','admin','organizer']) AND user_id=miqad_user());
  ELSE
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO miqad_app',tab);
   EXECUTE format('CREATE POLICY tenant_write ON %I FOR ALL TO miqad_app USING(miqad_can(tenant_id,ARRAY[''owner'',''admin'',''organizer''])) WITH CHECK(miqad_can(tenant_id,ARRAY[''owner'',''admin'',''organizer'']))',tab);
  END IF;
 END LOOP;
END $$;
-- Reception has no access to PII in this foundation; a limited projection is required before enabling it.
CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('001_foundation');
COMMIT;
