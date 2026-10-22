BEGIN;
ALTER TABLE sessions ADD COLUMN email_login_verified_at timestamptz;
ALTER TABLE login_challenges ADD COLUMN kind text NOT NULL DEFAULT 'totp' CHECK(kind IN('totp','email'));
ALTER TABLE login_challenges ADD COLUMN email_code_hash text;
ALTER TABLE login_challenges ADD COLUMN email_verified_at timestamptz;
ALTER TABLE login_challenges ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX login_email_cooldown ON login_challenges(user_id,kind,created_at DESC);
INSERT INTO schema_migrations(version) VALUES('006_email_login');
COMMIT;
