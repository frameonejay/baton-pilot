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

describe('POST /bookings 업무 시간 검증', () => {
  it('한국 시간 업무 시간을 벗어나면 400과 "업무 시간"이 든 메시지', async () => {
    const res = await post({
      room: 'A',
      title: 't',
      start: '2026-10-08T18:00:00+09:00',
      end: '2026-10-08T19:00:00+09:00',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('업무 시간');
  });

  it('업무 시간 밖이면서 길이도 어긋나면 400과 "업무 시간"이 든 메시지', async () => {
    const short = await post({
      room: 'A',
      title: 't',
      start: '2026-10-08T20:00:00+09:00',
      end: '2026-10-08T20:10:00+09:00',
    });
    expect(short.status).toBe(400);
    expect(short.body.error).toContain('업무 시간');
    const long = await post({
      room: 'A',
      title: 't',
      start: '2026-10-08T17:00:00+09:00',
      end: '2026-10-09T10:00:00+09:00',
    });
    expect(long.status).toBe(400);
    expect(long.body.error).toContain('업무 시간');
  });

  it('Z로 적은 시각이 한국 시간 업무 시간 안이면 201', async () => {
    const res = await post({ room: 'A', title: 't', start: '2026-10-08T08:00:00Z', end: '2026-10-08T09:00:00Z' });
    expect(res.status).toBe(201);
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
  const at = (hour: number) => `2026-10-08T${String(hour).padStart(2, '0')}:00:00+09:00`;
  /** A에 9~16시 1시간짜리 예약 8개(입력은 역순), B에 1개 */
  function seeded() {
    const store = new BookingStore();
    for (let hour = 16; hour >= 9; hour -= 1) {
      store.create({ room: 'A', title: `A${hour}`, start: at(hour), end: at(hour + 1) });
    }
    store.create({ room: 'B', title: 'B9', start: at(9), end: at(10) });
    return store;
  }
  const titles = (body: { items: { title: string }[] }) => body.items.map((b) => b.title);

  it('쿼리가 없으면 { items, total, limit: 20, offset: 0 }을 시작 시각 순으로 돌려준다', async () => {
    const res = await get(seeded(), '/bookings');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['items', 'limit', 'offset', 'total']);
    expect(res.body).toMatchObject({ total: 9, limit: 20, offset: 0 });
    expect(res.body.items).toHaveLength(9);
    const starts = res.body.items.map((b: { start: string }) => Date.parse(b.start));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('예약이 없으면 items는 빈 배열, total은 0', async () => {
    const res = await get(new BookingStore(), '/bookings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('limit·offset으로 자르고 total은 자르기 전 개수다', async () => {
    const res = await get(seeded(), '/bookings?room=A&limit=3&offset=2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 8, limit: 3, offset: 2 });
    expect(titles(res.body)).toEqual(['A11', 'A12', 'A13']);
  });

  it('offset이 total 이상이면 items는 빈 배열', async () => {
    const res = await get(seeded(), '/bookings?room=A&offset=8');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 8, limit: 20, offset: 8 });
  });

  it('limit 경계값 1과 100을 받는다', async () => {
    const one = await get(seeded(), '/bookings?limit=1');
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ total: 9, limit: 1 });
    expect(one.body.items).toHaveLength(1);
    const hundred = await get(seeded(), '/bookings?limit=100');
    expect(hundred.status).toBe(200);
    expect(hundred.body).toMatchObject({ total: 9, limit: 100 });
  });

  it.each([
    'limit=0',
    'limit=101',
    'limit=-1',
    'limit=1.5',
    'limit=abc',
    'limit=',
    'limit=1e1',
    'limit=%2B5',
    'offset=-1',
    'offset=0.5',
    'offset=x',
    'offset=',
  ])('%s이면 400과 한국어 오류 메시지', async (query) => {
    const res = await get(seeded(), `/bookings?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit|offset/);
  });

  it('room 필터는 지금처럼 그 회의실 예약만 돌려준다', async () => {
    const b = await get(seeded(), '/bookings?room=B');
    expect(b.body).toEqual({
      items: [expect.objectContaining({ title: 'B9', room: 'B' })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const none = await get(seeded(), '/bookings?room=Z');
    expect(none.body).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });
});
