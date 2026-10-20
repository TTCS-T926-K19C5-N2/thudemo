export const PolicyType = Object.freeze({
  TERMS_OF_SERVICE: 'TERMS_OF_SERVICE',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
  MARKETING_EMAIL: 'MARKETING_EMAIL',
});

export const ConsentStatus = Object.freeze({
  GRANTED: 'GRANTED',
  REVOKED: 'REVOKED',
});

export const CURRENT_POLICIES = Object.freeze({
  TERMS_OF_SERVICE: {
    type: 'TERMS_OF_SERVICE',
    version: 'TERMS-v1.0',
    title: 'Điều khoản dịch vụ',
    mandatory: true,
    summary: 'Quy định sử dụng dịch vụ bán vé sự kiện trực tuyến, quyền và nghĩa vụ của người mua vé.',
    effectiveDate: '2026-10-01',
  },
  PRIVACY_POLICY: {
    type: 'PRIVACY_POLICY',
    version: 'PRIVACY-NOTICE-R0-v1.0',
    title: 'Chính sách quyền riêng tư',
    mandatory: true,
    summary: 'Chính sách thu thập, lưu trữ, xử lý thông tin cá nhân và bảo mật dữ liệu người dùng.',
    effectiveDate: '2026-09-28',
  },
  MARKETING_EMAIL: {
    type: 'MARKETING_EMAIL',
    version: 'MARKETING-v1.0',
    title: 'Nhận thông tin tiếp thị qua email',
    mandatory: false,
    summary: 'Đồng ý nhận các bản tin sự kiện nổi bật, mã giảm giá và chương trình ưu đãi định kỳ qua email.',
    effectiveDate: '2026-10-01',
  },
});
