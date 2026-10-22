import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptDump,decryptDump,encryptionKey,expiredNames} from './sprint-backup.mjs';
test('S55 encrypted dump roundtrip and checksum-independent authenticated tamper rejection',()=>{
 const key=randomBytes(32),dump=Buffer.from('fixture database'),encrypted=encryptDump(dump,key);
 assert.deepEqual(decryptDump(encrypted,key),dump);
 assert.throws(()=>decryptDump(encrypted,randomBytes(32)));
 encrypted[encrypted.length-1]^=1;assert.throws(()=>decryptDump(encrypted,key));
});
test('S55 retains exactly today plus previous13 days and never targets unrelated files',()=>{
 const now=new Date('2026-10-22T20:00:00Z');
 assert.deepEqual(expiredNames(['codegym-2026-10-08.dump.enc','codegym-2026-10-09.dump.enc','codegym-2026-10-22.dump.enc','personal.dump.enc','../codegym-2026-10-01.dump.enc'],now),['codegym-2026-10-08.dump.enc']);
});
test('S55 rejects missing or malformed encryption secret',()=>{
 assert.throws(()=>encryptionKey(''));assert.throws(()=>encryptionKey('placeholder'));
 const raw=randomBytes(32).toString('base64url');assert.equal(encryptionKey(raw).length,32);
});
