import {generateKeyPairSync,randomBytes} from 'node:crypto';
const pair=generateKeyPairSync('ed25519');
const privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
Object.assign(process.env,{
 SCANNER_KEY_ID:'integration-b1a',SCANNER_SIGNING_PRIVATE_KEY_FILE:'',SCANNER_PUBLIC_KEY:'',
 SCANNER_SIGNING_PRIVATE_KEY:privateKey,SCANNER_PUBLIC_KEYS:JSON.stringify({'integration-b1a':publicKey}),
 TICKET_SIGNING_ACTIVE_KEY_ID:'integration-b1a',TICKET_SIGNING_PRIVATE_KEY:privateKey,
 TICKET_SIGNING_PUBLIC_KEYS:JSON.stringify({'integration-b1a':publicKey}),
 AUTH_PROXY_SECRET:randomBytes(32).toString('hex'),REGISTRATION_MAIL_KEY:randomBytes(32).toString('base64url'),
 REGISTRATION_PUBLIC_ORIGIN:'http://localhost:3393',
});
await import('../apps/api/scripts/verify-holds-http.mjs');
