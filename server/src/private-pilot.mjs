import {z} from 'zod';import {secretCipher} from './totp.mjs';import {mailSender} from './mail.mjs';
export function privatePilot(config){
 if(config.DEPLOYMENT_MODE!=='pilot')return null;
 if(config.NODE_ENV!=='production'||config.AUTH_SECURITY!=='enabled')throw Error('Private pilot requires production cookies and account security');
 const email=z.string().trim().email().max(254).parse(config.PRIVATE_PILOT_EMAIL||'').toLowerCase();
 const origin=new URL(config.PUBLIC_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==config.PUBLIC_ORIGIN)throw Error('Private pilot requires an exact HTTPS origin');
 secretCipher(config.AUTH_ENCRYPTION_KEY);mailSender(config);
 for(const [key,role] of [['DATABASE_URL','miqad_app'],['AUTH_DATABASE_URL','miqad_auth'],['PLATFORM_DATABASE_URL','miqad_platform']]){const url=new URL(config[key]);if(url.username!==role||!url.password)throw Error('Dedicated runtime role required');}
 if(config.DATABASE_ADMIN_URL||config.DATABASE_ROLE_SECRET)throw Error('Bootstrap credentials must be removed from the application process');
 const policy=config.PRIVATE_PILOT_MFA||'optional';if(!['optional','required'].includes(policy))throw Error('Invalid private pilot MFA policy');
 return {email,origin:origin.origin,requireMfa:policy==='required'};
}
