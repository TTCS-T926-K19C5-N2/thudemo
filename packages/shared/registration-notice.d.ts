export interface RegistrationNotice {
  version: string;
  purpose: string;
  title: string;
  paragraphs: readonly string[];
  consentLabel: string;
  withdrawalEmail: string;
}
export const REGISTRATION_NOTICE: Readonly<RegistrationNotice>;
