import { describe, it, expect, vi } from 'vitest';
import { EventsService } from './events.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
function setup(status = 'DRAFT', ready = true) {
  const event = {
    id: '11111111-1111-4111-8111-111111111111',
    organizerId: 'owner',
    name: 'Demo',
    description: 'Demo',
    location: 'Demo',
    status,
  };
  const tx = {
    event: {
      findUnique: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockImplementation(({ data }) => ({ ...event, ...data })),
    },
    showtime: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          ready ? [{ _count: { seats: 2 }, categories: [{ price: 100 }] }] : [],
        ),
    },
    catalogRevision: { update: vi.fn() },
    domainAudit: { create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const db = {
    ...tx,
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  return {
    service: new EventsService(db as unknown as PrismaService),
    tx,
    id: event.id,
  };
}
describe('Owner event publication', () => {
  it('publishes and invalidates catalog atomically', async () => {
    const f = setup();
    expect(
      (await f.service.publication(f.id, 'owner', { status: 'PUBLISHED' }))
        .status,
    ).toBe('PUBLISHED');
    expect(f.tx.domainAudit.create).toHaveBeenCalledTimes(1);
    expect(f.tx.catalogRevision.update).toHaveBeenCalledTimes(1);
  });
  it('rejects incomplete sale configuration', async () => {
    const f = setup('DRAFT', false);
    await expect(
      f.service.publication(f.id, 'owner', { status: 'PUBLISHED' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.tx.event.update).not.toHaveBeenCalled();
  });
  it('rejects another organizer', async () => {
    const f = setup();
    await expect(
      f.service.publication(f.id, 'other', { status: 'PUBLISHED' }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('same status is idempotent', async () => {
    const f = setup('PUBLISHED');
    await f.service.publication(f.id, 'owner', { status: 'PUBLISHED' });
    expect(f.tx.domainAudit.create).not.toHaveBeenCalled();
  });
  it('hides without deleting orders or tickets', async () => {
    const f = setup('PUBLISHED');
    expect(
      (await f.service.publication(f.id, 'owner', { status: 'DRAFT' })).status,
    ).toBe('DRAFT');
    expect(f.tx.event.update).toHaveBeenCalledWith({
      where: { id: f.id },
      data: { status: 'DRAFT' },
    });
  });
});
