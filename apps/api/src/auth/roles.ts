export const ROLE_NAMES = [
  'BUYER',
  'ORGANIZER',
  'TICKET_INSPECTOR',
  'ACCOUNTANT',
  'ADMIN',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

