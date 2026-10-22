export function mailSender(config,{request=fetch}={}){
 if(config.MAIL_PROVIDER!=='resend'||!config.MAIL_API_KEY||!config.MAIL_FROM||/[\r\n]/.test(config.MAIL_FROM))throw Error('Verified mail sender configuration is required');
 return async({to,subject,text,idempotencyKey})=>{const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.MAIL_API_KEY}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:JSON.stringify({from:config.MAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Mail delivery was not accepted');};
}
