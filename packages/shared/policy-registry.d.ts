export declare const PolicyType: {
  readonly TERMS_OF_SERVICE: 'TERMS_OF_SERVICE';
  readonly PRIVACY_POLICY: 'PRIVACY_POLICY';
  readonly MARKETING_EMAIL: 'MARKETING_EMAIL';
};

export type PolicyTypeValue = (typeof PolicyType)[keyof typeof PolicyType];

export declare const ConsentStatus: {
  readonly GRANTED: 'GRANTED';
  readonly REVOKED: 'REVOKED';
};

export type ConsentStatusValue = (typeof ConsentStatus)[keyof typeof ConsentStatus];

export interface PolicyDefinition {
  type: PolicyTypeValue;
  version: string;
  title: string;
  mandatory: boolean;
  summary: string;
  effectiveDate: string;
}

export declare const CURRENT_POLICIES: {
  readonly TERMS_OF_SERVICE: PolicyDefinition;
  readonly PRIVACY_POLICY: PolicyDefinition;
  readonly MARKETING_EMAIL: PolicyDefinition;
};
