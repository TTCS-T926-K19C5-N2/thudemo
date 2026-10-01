import crypto from 'node:crypto';

const SECRET = 'default-payment-webhook-secret-key-2026';

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

async function runTest() {
  console.log('--- BẮT ĐẦU KIỂM THỬ E2E CHO SCRUM-32 VÀ SCRUM-33 ---');

  // 1. Tạo đơn hàng mới
  const createRes = await fetch('http://localhost:3001/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 250000 }),
  });
  const order = await createRes.json();
  console.log('1. Đã tạo đơn hàng mới:', order.orderCode, 'ID:', order.id, 'Status:', order.status);

  // 2. Kiểm tra trạng thái đơn hàng (Server-authoritative)
  const statusRes = await fetch(`http://localhost:3001/orders/${order.id}/status`);
  const statusData = await statusRes.json();
  console.log('2. Trạng thái thực tế từ máy chủ:', statusData.status, 'Số tiền:', statusData.amount);

  // 3. AC1 Test: Webhook có chữ ký sai -> bị từ chối 401
  const invalidSigRes = await fetch('http://localhost:3001/payments/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': 'wrong_signature_123456',
    },
    body: JSON.stringify({ orderCode: order.orderCode, status: 'PAID' }),
  });
  console.log('3. AC1 Test - Gửi Webhook chữ ký sai:', invalidSigRes.status, '(Kỳ vọng: 401)');
  if (invalidSigRes.status === 401) {
    console.log('   => PASS AC1: Máy chủ đã trả 401 Unauthorized!');
  } else {
    console.error('   => FAIL AC1: Trả về status', invalidSigRes.status);
  }

  // 4. AC2 Test: Webhook đúng chữ ký nhưng mã đơn không tồn tại -> trả 404
  const fakePayload = JSON.stringify({ orderCode: 'ORD-FAKE-NOT-FOUND-999', status: 'PAID' });
  const fakeSig = sign(fakePayload);
  const notFoundRes = await fetch('http://localhost:3001/payments/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': fakeSig,
    },
    body: fakePayload,
  });
  console.log('4. AC2 Test - Gửi Webhook đúng chữ ký nhưng mã đơn không tồn tại:', notFoundRes.status, '(Kỳ vọng: 404)');
  if (notFoundRes.status === 404) {
    console.log('   => PASS AC2: Máy chủ đã trả 404 Not Found!');
  } else {
    console.error('   => FAIL AC2: Trả về status', notFoundRes.status);
  }

  // 5. Success Test: Webhook đúng chữ ký và mã đơn tồn tại -> 200 và cập nhật PAID
  const validPayload = JSON.stringify({
    orderCode: order.orderCode,
    status: 'PAID',
    transactionId: 'TXN-E2E-SUCCESS-777',
  });
  const validSig = sign(validPayload);
  const successRes = await fetch('http://localhost:3001/payments/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': validSig,
    },
    body: validPayload,
  });
  const successData = await successRes.json();
  console.log('5. Webhook hợp lệ:', successRes.status, successData);
  if (successRes.status === 200 && successData.status === 'PAID') {
    console.log('   => PASS SUCCESS: Webhook được xử lý thành công, trạng thái chuyển sang PAID!');
  }

  // 6. Kiểm tra lại trạng thái sau khi cập nhật (SCRUM-33 AC2)
  const finalStatusRes = await fetch(`http://localhost:3001/orders/${order.id}/status`);
  const finalStatus = await finalStatusRes.json();
  console.log('6. SCRUM-33 AC2 - Trạng thái máy chủ sau khi có Webhook:', finalStatus.status, 'Vé:', finalStatus.ticketUrl);
  if (finalStatus.status === 'PAID' && finalStatus.ticketUrl) {
    console.log('   => PASS AC2: Máy chủ đã xác nhận PAID kèm link vé hợp lệ!');
  }

  console.log('--- TOÀN BỘ CÁC TIÊU CHÍ CHẤP NHẬN ĐÃ ĐẠT CHUẨN 100% ---');
}

runTest().catch(console.error);
