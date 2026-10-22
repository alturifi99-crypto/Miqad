import pg from 'pg';
const email=process.argv[2];if(!email)throw Error('Pass an existing platform-owner email, never a password.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_ADMIN_URL});try{const result=await pool.query('INSERT INTO platform_admins(user_id) SELECT id FROM users WHERE email=$1 ON CONFLICT DO NOTHING RETURNING user_id',[email.toLowerCase()]);console.log(result.rowCount?'Platform administrator assigned.':'No change; verify the existing account and assignment.');}finally{await pool.end();}
