import crypto from 'node:crypto';

const orderId = process.argv[2];
if (!orderId) {
  console.error('Usage: node scripts/simulate-payment-webhook.mjs <orderId>');
  process.exit(1);
}

const apiOrigin = process.env.API_ORIGIN || 'http://localhost:3001';
const accessKey = process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85';
const secretKey = process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX08PD3vg6EkVlz';

async function main() {
  console.log(`Fetching order ${orderId} from API ${apiOrigin}...`);
  const orderRes = await fetch(`${apiOrigin}/orders/${orderId}`);
  if (!orderRes.ok) {
    console.error(`Failed to fetch order: HTTP ${orderRes.status}`);
    const text = await orderRes.text();
    console.error(text);
    process.exit(1);
  }

  const order = await orderRes.json();
  const amount = Number(order.totalAmount);
  console.log(`Order status: ${order.status}, Total amount: ${amount} VND`);

  const extraData = Buffer.from(JSON.stringify({ orderId: order.id })).toString('base64');
  const gatewayRef = `${order.id}_${Date.now()}_sim`;

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
    orderInfo: `Thanh toán đơn hàng ${order.id}`,
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
  const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
  payload.signature = signature;
  delete payload.accessKey;

  console.log(`Sending simulated MoMo webhook to ${apiOrigin}/payments/webhook...`);
  const webhookRes = await fetch(`${apiOrigin}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!webhookRes.ok) {
    console.error(`Webhook failed: HTTP ${webhookRes.status}`);
    const errText = await webhookRes.text();
    console.error(errText);
    process.exit(1);
  }

  const result = await webhookRes.json();
  console.log('Webhook result:', result);
  console.log(`\n🎉 Đơn hàng ${orderId} đã được thanh toán thành công (PAID)!`);
  console.log(`Bạn có thể tải lại trang http://localhost:3000/orders/${orderId} hoặc http://localhost:3000/payment/result?orderId=${orderId} để xem kết quả.`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
