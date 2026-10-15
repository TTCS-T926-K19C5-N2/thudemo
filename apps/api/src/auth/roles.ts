export const ROLE_NAMES = [
  'BUYER',
  'ORGANIZER',
  'STAFF',
  'ACCOUNTANT',
  'ADMIN',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
