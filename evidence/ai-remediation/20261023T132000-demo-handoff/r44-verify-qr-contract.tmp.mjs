import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createPrivateKey,createPublicKey,verify} from 'node:crypto';
const b='D:/Merge_2/Codegym-demo-proof-20261023T1530';
const req=createRequire(b+'/apps/api/package.json');
const {ticketQrInput,parseTicketQr}=req('shared/ticket-qr');
const runtime=JSON.parse(readFileSync('D:/Merge_2/Codegym/evidence/ai-remediation/20261023T132000-demo-handoff/.r44-runtime-public-key.tmp.json','utf8'));
const cfg=JSON.parse(readFileSync(b+'/.sprint1-demo/config.json','utf8'));
const priv=createPrivateKey(readFileSync(b+'/.sprint1-demo/signing.pem'));
const pubRuntime=createPublicKey(runtime.keys.find(k=>k.keyId===cfg.profile).key);
const pubLocal=createPublicKey(priv);
const payload=readFileSync('D:/Merge_2/Codegym/evidence/ai-remediation/20261023T132000-demo-handoff/.r44-ticket-payload.tmp','utf8');
const claims=parseTicketQr(payload);
const parts=payload.split('.'); const shape={parts:parts.length,version:parts[0],algorithm:parts[1],keyIdLength:parts[2]?.length,showtimeLength:parts[3]?.length,ticketLength:parts[4]?.length,signatureLength:parts[5]?.length,signatureLast:parts[5]?.slice(-1),ticketUuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(parts[4]||'')}; const signatureValid=!!claims&&verify(null,Buffer.from(claims.signingInput,'ascii'),pubRuntime,Buffer.from(claims.signature,'base64url'));
console.log(JSON.stringify({profileGuard:cfg.profile===runtime.keys[0]?.keyId,publicKeyMatch:pubLocal.export({type:'spki',format:'der'}).equals(pubRuntime.export({type:'spki',format:'der'})),runtimeQrFormat:claims?'ET1/Ed25519':'unparseable',signatureValid,payloadLength:payload.length,shape}));

