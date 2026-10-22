BEGIN;
DROP POLICY tenant_write ON import_batches;
DROP POLICY tenant_read ON import_batches;
REVOKE UPDATE,DELETE ON import_batches FROM miqad_app;
CREATE POLICY import_read ON import_batches FOR SELECT TO miqad_app USING(miqad_can(tenant_id,ARRAY['owner','admin']));
CREATE POLICY import_insert ON import_batches FOR INSERT TO miqad_app WITH CHECK(miqad_can(tenant_id,ARRAY['owner','admin']));
DROP POLICY tenant_write ON tenant_subscriptions;
DROP POLICY tenant_read ON tenant_subscriptions;
REVOKE INSERT,UPDATE,DELETE ON tenant_subscriptions FROM miqad_app;
GRANT SELECT,INSERT,UPDATE ON tenant_subscriptions TO miqad_platform;
CREATE POLICY subscription_read ON tenant_subscriptions FOR SELECT TO miqad_app USING(miqad_can(tenant_id,ARRAY['owner','admin']));
CREATE POLICY subscription_platform ON tenant_subscriptions TO miqad_platform USING(true) WITH CHECK(true);
DROP POLICY tenant_read ON audit_logs;
CREATE POLICY audit_read ON audit_logs FOR SELECT TO miqad_app USING(miqad_can(tenant_id,ARRAY['owner','admin']));
CREATE FUNCTION check_delegation_leader() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; ids uuid[]; t uuid;
BEGIN
 IF TG_TABLE_NAME='delegations' THEN ids:=ARRAY[NEW.id]; t:=NEW.tenant_id;
 ELSE ids:=ARRAY[NEW.delegation_id,OLD.delegation_id];t:=coalesce(NEW.tenant_id,OLD.tenant_id);END IF;
 FOR d IN SELECT * FROM delegations WHERE tenant_id=t AND id=ANY(ids) LOOP
  IF NOT EXISTS(SELECT 1 FROM delegation_members m WHERE m.tenant_id=d.tenant_id AND m.event_id=d.event_id AND m.delegation_id=d.id AND m.guest_id=d.leader_id) THEN RAISE EXCEPTION 'Delegation leader must be a member' USING ERRCODE='23514';END IF;
 END LOOP;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER delegation_leader_guard AFTER INSERT OR UPDATE ON delegations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_delegation_leader();
CREATE CONSTRAINT TRIGGER delegation_member_guard AFTER INSERT OR UPDATE OR DELETE ON delegation_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_delegation_leader();
INSERT INTO schema_migrations(version) VALUES('002_hardening');
COMMIT;
