import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BookingStore } from '../src/bookings.ts';
import { handler } from '../src/server.ts';

async function post(body: unknown, store = new BookingStore()) {
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
  await handler(store)(req, res);
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

describe('POST /bookings repeatWeeks', () => {
  const weekly = { ...slot, title: '주간 회의' };

  it('repeatWeeks가 2~12의 정수가 아니면 400', async () => {
    for (const repeatWeeks of [1, 13, 2.5, '3', null]) {
      const res = await post({ ...weekly, repeatWeeks });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('repeatWeeks');
    }
  });

  it('repeatWeeks가 n이면 201과 첫 주부터 n개 예약의 배열', async () => {
    const res = await post({ ...weekly, repeatWeeks: 3 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual([
      { ...weekly, id: 'bk-1' },
      { ...weekly, id: 'bk-2', start: '2026-10-15T09:00:00+09:00', end: '2026-10-15T10:00:00+09:00' },
      { ...weekly, id: 'bk-3', start: '2026-10-22T09:00:00+09:00', end: '2026-10-22T10:00:00+09:00' },
    ]);
  });

  it('한 주라도 기존 예약과 겹치면 409이고 아무것도 만들지 않는다', async () => {
    const store = new BookingStore();
    store.create({ room: 'A', title: '기존', start: '2026-10-29T09:30:00+09:00', end: '2026-10-29T10:30:00+09:00' });
    const res = await post({ ...weekly, repeatWeeks: 4 }, store);
    expect(res.status).toBe(409);
    expect(store.list()).toHaveLength(1);
  });

  it('repeatWeeks가 없으면 지금처럼 예약 하나를 객체로 돌려준다', async () => {
    const res = await post(weekly);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ...weekly, id: 'bk-1' });
  });
});
