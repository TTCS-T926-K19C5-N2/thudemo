/** A definitive provider response that says no payment was created. */
export class PaymentGatewayRejectedError extends Error {
  constructor(readonly providerCode: string) {
    super('Payment provider rejected payment initialization.');
    this.name = 'PaymentGatewayRejectedError';
  }
}

/** The request may have reached the provider, but its outcome was not received. */
export class PaymentGatewayOutcomeUnknownError extends Error {
  constructor(readonly reason: string) {
    super('Payment initialization outcome is unknown.');
    this.name = 'PaymentGatewayOutcomeUnknownError';
  }
}
