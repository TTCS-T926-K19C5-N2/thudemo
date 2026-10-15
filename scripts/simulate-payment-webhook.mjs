import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const rawArg = process.argv[2];
let uuid;
if (rawArg) {
  const match = rawArg.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  if (match) {
    uuid = match[0];
  } else {
    console.error(`Mã đơn hàng không hợp lệ: "${rawArg}"`);
    process.exit(1);
  }
}

const query = uuid
  ? `SELECT row_to_json(orders) FROM orders WHERE id = '${uuid}';`
  : `SELECT row_to_json(orders) FROM orders WHERE status IN ('PENDING', 'PENDING_PAYMENT') ORDER BY id DESC LIMIT 1;`;

let jsonStr = '';
const dbCandidates = ['stitch_fidelity', 'sprint2_local'];
for (const db of dbCandidates) {
  try {
    const out = execFileSync(
      'docker',
      [
        'exec',
        'sang-sprint2-postgres-20261004',
        'psql',
        '-U',
        'sprint2',
        '-d',
        db,
        '-t',
        '-A',
        '-c',
        query,
      ],
      { encoding: 'utf8' },
    ).trim();
    if (out) {
      jsonStr = out;
      break;
    }
  } catch {
    // try next candidate
  }
}

if (!jsonStr) {
  console.error(
    uuid
      ? `Không tìm thấy đơn hàng "${uuid}" trong CSDL!`
      : 'Không tìm thấy đơn hàng nào đang chờ thanh toán trong CSDL!',
  );
  process.exit(1);
}

const order = JSON.parse(jsonStr);
const orderId = order.id;
const amount = Number(order.totalAmount);
console.log(`\nTìm thấy đơn hàng: ${orderId}`);
console.log(`Trạng thái hiện tại: ${order.status}`);
console.log(`Tổng tiền thanh toán: ${amount.toLocaleString('vi-VN')} VND`);

const apiOrigin = process.env.API_ORIGIN || 'http://localhost:3001';
const accessKey = process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85';
const secretKey =
  process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX08PD3vg6EkVlz';

const extraData = Buffer.from(JSON.stringify({ orderId })).toString('base64');
const gatewayRef = rawArg && rawArg.includes('_') ? rawArg : `${orderId}_${Date.now()}_sim`;

const MOMO_IPN_SIGNATURE_FIELDS = [
  'accessKey',
  'amount',
  'extraData',
  'message',
  'orderId',
  'orderInfo',
  'orderType',
  'partnerCode',
  'payType',
  'requestId',
  'responseTime',
  'resultCode',
  'transId',
];

const payload = {
  accessKey,
  partnerCode: 'MOMO',
  orderId: gatewayRef,
  requestId: gatewayRef,
  amount,
  orderInfo: `Thanh toán đơn hàng ${orderId}`,
  orderType: 'momo_wallet',
  transId: `momo_sim_${Date.now()}`,
  resultCode: 0,
  message: 'Giao dịch thành công.',
  payType: 'qr',
  responseTime: Date.now(),
  extraData,
};

const parts = MOMO_IPN_SIGNATURE_FIELDS.map((f) => `${f}=${payload[f] ?? ''}`);
const rawSignature = parts.join('&');
const signature = crypto
  .createHmac('sha256', secretKey)
  .update(rawSignature)
  .digest('hex');
payload.signature = signature;
delete payload.accessKey;

console.log(`\nĐang gửi webhook MoMo IPN tới ${apiOrigin}/payments/webhook...`);
try {
  const webhookRes = await fetch(`${apiOrigin}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!webhookRes.ok) {
    console.error(`Webhook thất bại: HTTP ${webhookRes.status}`);
    const errText = await webhookRes.text();
    console.error(errText);
    process.exit(1);
  }

  const result = await webhookRes.json();
  console.log('Kết quả từ máy chủ:', result);
  console.log(`\n🎉 Đơn hàng ${orderId} đã được thanh toán thành công (PAID)!`);
  console.log(
    `Vui lòng kiểm tra màn hình: http://localhost:3000/payment/result?orderId=${orderId}`,
  );
} catch (fetchErr) {
  console.error(`Không thể kết nối tới ${apiOrigin}: ${fetchErr.message}`);
  process.exit(1);
}
