import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BookingStore } from '../src/bookings.ts';
import { handler } from '../src/server.ts';

async function get(store: BookingStore, url: string) {
  const req = Object.assign(Readable.from([]), { method: 'GET', url }) as unknown as IncomingMessage;
  const out = { status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(chunk?: string) {
      out.body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  await handler(store)(req, res);
  return { status: out.status, body: out.body ? JSON.parse(out.body) : null };
}

/** 회의실 A에 count개, B에 1개. A는 일부러 늦은 시각부터 만든다. */
function seed(count: number) {
  const store = new BookingStore();
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = String(1 + Math.floor(i / 8)).padStart(2, '0');
    const hour = String(9 + (i % 8)).padStart(2, '0');
    store.create({
      room: 'A',
      title: `a${i}`,
      start: `2026-10-${day}T${hour}:00:00+09:00`,
      end: `2026-10-${day}T${hour}:30:00+09:00`,
    });
  }
  store.create({ room: 'B', title: 'b0', start: '2026-10-01T09:00:00+09:00', end: '2026-10-01T10:00:00+09:00' });
  return store;
}

describe('GET /bookings 페이지네이션', () => {
  it('기본값은 limit 20, offset 0이고 { items, total, limit, offset }을 돌려준다', async () => {
    const res = await get(seed(24), '/bookings?room=A');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['items', 'limit', 'offset', 'total']);
    expect(res.body).toMatchObject({ total: 24, limit: 20, offset: 0 });
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(
      Array.from({ length: 20 }, (_, i) => `a${i}`),
    );
  });

  it('items는 시작 시각 순이고 limit·offset만큼 자르며, total은 자르기 전 개수다', async () => {
    const res = await get(seed(10), '/bookings?room=A&limit=3&offset=4');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 10, limit: 3, offset: 4 });
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(['a4', 'a5', 'a6']);
  });

  it('offset이 total 이상이면 빈 items', async () => {
    const res = await get(seed(3), '/bookings?room=A&offset=3');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 3, limit: 20, offset: 3 });
  });

  it('limit 1과 100은 받는다', async () => {
    const store = seed(3);
    expect((await get(store, '/bookings?limit=1')).body).toMatchObject({ limit: 1, total: 4 });
    expect((await get(store, '/bookings?limit=100')).body).toMatchObject({ limit: 100, total: 4 });
  });

  it.each([
    'limit=0',
    'limit=101',
    'limit=-1',
    'limit=1.5',
    'limit=abc',
    'limit=',
    'limit=1e1',
    'offset=-1',
    'offset=0.5',
    'offset=x',
    'offset=',
  ])('%s이면 400', async (query) => {
    const res = await get(seed(3), `/bookings?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('room 필터는 그대로 동작하고 total에 반영된다', async () => {
    const store = seed(2);
    const b = await get(store, '/bookings?room=B');
    expect(b.body).toMatchObject({ total: 1 });
    expect(b.body.items.map((x: { title: string }) => x.title)).toEqual(['b0']);
    const all = await get(store, '/bookings');
    expect(all.body.total).toBe(3);
    expect(all.body.items.map((x: { title: string }) => x.title)).toEqual(['a0', 'b0', 'a1']);
    expect((await get(store, '/bookings?room=Z')).body).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });
});
