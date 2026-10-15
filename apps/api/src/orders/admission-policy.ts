// PO approved in the S-31 chat on 2026-10-08: separate capability by showtime/gate.
// Role STAFF/ADMIN/ORGANIZER alone never grants ordinary or exception admission.
export const ADMISSION_OVERRIDE_POLICY = {
  approved: true,
  decision: 'S31-PO-20261008-SCOPED-CAPABILITY',
} as const;
