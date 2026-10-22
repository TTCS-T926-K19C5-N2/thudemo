import { config } from 'dotenv';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;

console.log('Testing SMTP connection to:', host, 'port:', port);
const transporter = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user, pass },
  connectionTimeout: 5000,
});

transporter.verify()
  .then(() => console.log('SMTP_STATUS: SUCCESS'))
  .catch(err => {
    console.log('SMTP_STATUS: FAILED');
    console.log('Error Code:', err.code);
    console.log('Error Message:', err.message);
  });
