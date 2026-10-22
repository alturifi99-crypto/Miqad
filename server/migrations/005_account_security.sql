BEGIN;
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN mfa_secret text;
ALTER TABLE users ADD COLUMN mfa_pending_secret text;
ALTER TABLE users ADD COLUMN mfa_last_counter bigint;
ALTER TABLE sessions ADD COLUMN mfa_verified_at timestamptz;
CREATE TABLE account_tokens(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),purpose text NOT NULL CHECK(purpose IN('verify','reset')),expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX account_tokens_user_purpose ON account_tokens(user_id,purpose,created_at DESC);
CREATE TABLE login_challenges(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,used_at timestamptz);
CREATE TABLE mfa_recovery_codes(user_id uuid NOT NULL REFERENCES users(id),code_hash text NOT NULL,used_at timestamptz,PRIMARY KEY(user_id,code_hash));
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['account_tokens','login_challenges','mfa_recovery_codes'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO miqad_auth',tab);
 EXECUTE format('CREATE POLICY identity_auth ON %I TO miqad_auth USING(true) WITH CHECK(true)',tab);
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES('005_account_security');
COMMIT;
