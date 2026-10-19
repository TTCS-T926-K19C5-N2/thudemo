import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';

// Separate from registration SMTP: fake ticket acceptance must not redirect
// existing activation messages or inherit arbitrary environment/secret values.
export function ticketMailEnv(directory){
  const file=resolve(directory,'ticket-mail.env');
  if(!existsSync(file))return {TICKET_MAIL_WORKER:'false'};
  const input=parseEnv(readFileSync(file,'utf8'));
  if(input.TICKET_MAIL_WORKER!=='true')return {TICKET_MAIL_WORKER:'false'};
  if(input.TICKET_MAIL_MODE==='smtp')return {TICKET_MAIL_WORKER:'true',TICKET_MAIL_MODE:'smtp'};
  const recipients=(input.TICKET_MAIL_ALLOWED_EMAILS??'').split(',').map(s=>s.trim()).filter(Boolean);
  if(input.TICKET_MAIL_MODE!=='catcher' || !['mailpit','localhost','127.0.0.1'].includes(input.TICKET_SMTP_HOST) ||
    !/^\d+$/.test(input.TICKET_SMTP_PORT??'') || Number(input.TICKET_SMTP_PORT)<1 || Number(input.TICKET_SMTP_PORT)>65535 ||
    !/^[^\s<>@]+@[^\s<>@]+$/.test(input.TICKET_SMTP_FROM??'') || !recipients.length ||
    recipients.some(s=>!/^[^\s<>@]+@[^\s<>@]+$/.test(s)))throw Error('Invalid private staging ticket transport; worker not started');
  return {TICKET_MAIL_WORKER:'true',TICKET_MAIL_MODE:'catcher',TICKET_SMTP_HOST:input.TICKET_SMTP_HOST,
    TICKET_SMTP_PORT:input.TICKET_SMTP_PORT,TICKET_SMTP_FROM:input.TICKET_SMTP_FROM,TICKET_MAIL_ALLOWED_EMAILS:recipients.join(',')};
}
