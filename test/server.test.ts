import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BookingStore } from '../src/bookings.ts';
import { handler } from '../src/server.ts';

async function post(body: unknown) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    url: '/bookings',
  }) as unknown as IncomingMessage;
  const out = { status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(chunk?: string) {
      out.body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  await handler(new BookingStore())(req, res);
  return { status: out.status, body: out.body ? JSON.parse(out.body) : null };
}

const slot = { room: 'A', start: '2026-10-08T09:00:00+09:00', end: '2026-10-08T10:00:00+09:00' };

describe('POST /bookings 예약 길이 검증', () => {
  const day = (time: string) => `2026-10-08T${time}:00+09:00`;

  it('15분보다 짧으면 400과 "15분"이 든 메시지', async () => {
    const res = await post({ room: 'A', title: 't', start: day('09:00'), end: day('09:14') });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('15분');
  });

  it('4시간을 넘으면 400과 "4시간"이 든 메시지', async () => {
    const res = await post({ room: 'A', title: 't', start: day('09:00'), end: day('13:01') });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('4시간');
  });

  it('정확히 15분, 정확히 4시간이면 201', async () => {
    expect((await post({ room: 'A', title: 't', start: day('09:00'), end: day('09:15') })).status).toBe(201);
    expect((await post({ room: 'A', title: 't', start: day('09:00'), end: day('13:00') })).status).toBe(201);
  });
});

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

describe('GET /bookings 페이지네이션', () => {
  const hour = (h: number) => `2026-10-08T${String(h).padStart(2, '0')}:00:00+09:00`;
  /** A에 9~13시 예약 5개(역순으로 만든다), B에 1개 */
  const seeded = () => {
    const store = new BookingStore();
    for (const h of [13, 12, 11, 10, 9]) store.create({ room: 'A', title: `A${h}`, start: hour(h), end: hour(h + 1) });
    store.create({ room: 'B', title: 'B9', start: hour(9), end: hour(10) });
    return store;
  };

  it('기본값이면 { items, total, limit: 20, offset: 0 }을 시작 시각 순으로 돌려준다', async () => {
    const res = await get(seeded(), '/bookings');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(0);
    expect(res.body.items.map((b: { start: string }) => b.start)).toEqual(
      [...res.body.items.map((b: { start: string }) => b.start)].sort(),
    );
    expect(res.body.items).toHaveLength(6);
  });

  it('limit·offset으로 자르고 total은 자르기 전 개수다', async () => {
    const res = await get(seeded(), '/bookings?room=A&limit=2&offset=1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, limit: 2, offset: 1 });
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(['A10', 'A11']);
  });

  it('offset이 total 이상이면 빈 items', async () => {
    const res = await get(seeded(), '/bookings?offset=6');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 6, limit: 20, offset: 6 });
  });

  it('limit 경계값 1과 100은 받는다', async () => {
    expect((await get(seeded(), '/bookings?limit=1')).body.items).toHaveLength(1);
    expect((await get(seeded(), '/bookings?limit=100')).body).toMatchObject({ limit: 100, total: 6 });
  });

  it('room 필터는 지금처럼 동작한다', async () => {
    const res = await get(seeded(), '/bookings?room=B');
    expect(res.body.total).toBe(1);
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(['B9']);
    expect((await get(seeded(), '/bookings?room=C')).body).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it.each([
    'limit=0',
    'limit=101',
    'limit=-1',
    'limit=1.5',
    'limit=abc',
    'limit=',
    'offset=-1',
    'offset=0.5',
    'offset=x',
  ])('%s이면 400', async (query) => {
    const res = await get(seeded(), `/bookings?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit|offset/);
  });
});
