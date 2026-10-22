import {z} from 'zod';import {secretCipher} from './totp.mjs';import {mailSender} from './mail.mjs';
export function privatePilot(config){
 if(!['pilot','beta'].includes(config.DEPLOYMENT_MODE))return null;
 const publicBeta=config.DEPLOYMENT_MODE==='beta';
 if(config.NODE_ENV!=='production'||config.AUTH_SECURITY!=='enabled')throw Error('Private pilot requires production cookies and account security');
 const email=publicBeta?null:z.string().trim().email().max(254).parse(config.PRIVATE_PILOT_EMAIL||'').toLowerCase();
 const origin=new URL(config.PUBLIC_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==config.PUBLIC_ORIGIN)throw Error('Private pilot requires an exact HTTPS origin');
 secretCipher(config.AUTH_ENCRYPTION_KEY);mailSender(config);
 for(const [key,role] of [['DATABASE_URL','miqad_app'],['AUTH_DATABASE_URL','miqad_auth'],['PLATFORM_DATABASE_URL','miqad_platform']]){const url=new URL(config[key]);if(url.username!==role||!url.password)throw Error('Dedicated runtime role required');}
 if(config.DATABASE_ADMIN_URL||config.DATABASE_ROLE_SECRET)throw Error('Bootstrap credentials must be removed from the application process');
 const policy=config.PRIVATE_PILOT_MFA||'optional';if(!['optional','required'].includes(policy))throw Error('Invalid private pilot MFA policy');
 if(publicBeta){const from=config.MAIL_FROM.match(/(?:<)?([^<>\s]+@([^<>\s]+))(?:>)?$/);if(!from||from[2].toLowerCase()==='resend.dev')throw Error('Public beta requires a custom verified sending domain');}
 return {email,publicBeta,origin:origin.origin,requireMfa:publicBeta?false:policy==='required'};
}
