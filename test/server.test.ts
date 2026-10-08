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

describe('POST /bookings 제목 검증', () => {
  it('제목이 없으면 400과 TITLE_REQUIRED', async () => {
    const res = await post(slot);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'TITLE_REQUIRED' });
  });

  it('제목이 공백뿐이면 400과 TITLE_REQUIRED', async () => {
    const res = await post({ ...slot, title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'TITLE_REQUIRED' });
  });

  it('제목이 100자를 넘으면 400과 TITLE_TOO_LONG', async () => {
    const res = await post({ ...slot, title: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'TITLE_TOO_LONG' });
  });

  it('제목이 100자 정확히면 201', async () => {
    const res = await post({ ...slot, title: 'a'.repeat(100) });
    expect(res.status).toBe(201);
  });
});
