export type RefundResult =
  | { status: 'SUCCEEDED'; providerRef: string }
  | { status: 'FAILED'; code: string };
export interface RefundGateway {
  refund(id: string, amount: number, attempt: number): Promise<RefundResult>;
}
/** No external transfers. Same refund ID always identifies the same operation. */
export class MockRefundGateway implements RefundGateway {
  constructor(private readonly failAttempts = 0) {}
  async refund(
    id: string,
    amount: number,
    attempt: number,
  ): Promise<RefundResult> {
    if (!Number.isSafeInteger(amount) || amount < 0)
      return { status: 'FAILED', code: 'INVALID_AMOUNT' };
    if (attempt <= this.failAttempts)
      return { status: 'FAILED', code: 'MOCK_PROVIDER_UNAVAILABLE' };
    return { status: 'SUCCEEDED', providerRef: `mock-refund-${id}` };
  }
}
