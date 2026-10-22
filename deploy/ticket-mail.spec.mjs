import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ticketMailEnv} from './ticket-mail.mjs';
test('ticket worker stays disabled unless configured explicitly',()=>{
 const dir=mkdtempSync(join(tmpdir(),'thudemo-ticket-mail-'));assert.deepEqual(ticketMailEnv(dir),{TICKET_MAIL_WORKER:'false'});
 writeFileSync(join(dir,'ticket-mail.env'),'TICKET_MAIL_MODE=smtp\n');assert.deepEqual(ticketMailEnv(dir),{TICKET_MAIL_WORKER:'false'});
});
test('catcher is bounded to local host and explicit recipients; arbitrary secrets never imported',()=>{
 const dir=mkdtempSync(join(tmpdir(),'thudemo-ticket-mail-'));
 const config='TICKET_MAIL_WORKER=true\nTICKET_MAIL_MODE=catcher\nTICKET_SMTP_HOST=mailpit\nTICKET_SMTP_PORT=1025\nTICKET_SMTP_FROM=tickets@demo.invalid\nTICKET_MAIL_ALLOWED_EMAILS=buyer@demo.invalid\nDATABASE_URL=forbidden\nSMTP_PASSWORD=forbidden\n';
 writeFileSync(join(dir,'ticket-mail.env'),config);const result=ticketMailEnv(dir);assert.equal(result.TICKET_MAIL_WORKER,'true');assert.equal(result.DATABASE_URL,undefined);assert.equal(result.SMTP_PASSWORD,undefined);
 for(const altered of [config.replace('TICKET_SMTP_HOST=mailpit','TICKET_SMTP_HOST=smtp.external.invalid'),config.replace('TICKET_MAIL_ALLOWED_EMAILS=buyer@demo.invalid','TICKET_MAIL_ALLOWED_EMAILS='),config.replace('TICKET_SMTP_PORT=1025','TICKET_SMTP_PORT=65536')]){writeFileSync(join(dir,'ticket-mail.env'),altered);assert.throws(()=>ticketMailEnv(dir));}
});
test('smtp reuses T08 settings rather than importing another credential set',()=>{
 const dir=mkdtempSync(join(tmpdir(),'thudemo-ticket-mail-'));writeFileSync(join(dir,'ticket-mail.env'),'TICKET_MAIL_WORKER=true\nTICKET_MAIL_MODE=smtp\nSMTP_PASSWORD=forbidden');assert.deepEqual(ticketMailEnv(dir),{TICKET_MAIL_WORKER:'true',TICKET_MAIL_MODE:'smtp'});
});
