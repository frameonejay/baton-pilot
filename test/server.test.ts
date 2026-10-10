import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    const name = query.split('=')[0];
    const range = name === 'limit' ? '1~100' : '0 이상';
    expect(res.body.error).toBe(`${name}은 ${range}의 정수여야 합니다`);
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

describe('GET /bookings 정렬', () => {
  it('오프셋이 달라도 실제 시각 순이고, 시작 시각이 같으면 먼저 만든 예약이 앞이다', async () => {
    const store = new BookingStore();
    store.create({ room: 'A', title: '11시', start: '2026-10-08T02:00:00Z', end: '2026-10-08T03:00:00Z' });
    store.create({
      room: 'B',
      title: '10시 먼저',
      start: '2026-10-08T10:00:00+09:00',
      end: '2026-10-08T11:00:00+09:00',
    });
    store.create({ room: 'A', title: '10시 나중', start: '2026-10-08T01:00:00Z', end: '2026-10-08T02:00:00Z' });
    const res = await get(store, '/bookings');
    expect(res.status).toBe(200);
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(['10시 먼저', '10시 나중', '11시']);
  });
});

async function del(store: BookingStore, id: string) {
  const req = Object.assign(Readable.from([]), {
    method: 'DELETE',
    url: `/bookings/${id}`,
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

describe('DELETE /bookings/:id 취소 정책', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** 10:00~11:00 예약 하나 */
  function seeded() {
    const store = new BookingStore();
    const b = store.create({
      ...slot,
      title: 't',
      start: '2026-10-08T10:00:00+09:00',
      end: '2026-10-08T11:00:00+09:00',
    });
    return { store, b };
  }

  it('시작까지 정확히 1시간 남았으면 204', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T09:00:00+09:00') });
    const { store, b } = seeded();
    const res = await del(store, b.id);
    expect(res.status).toBe(204);
    expect(store.list()).toEqual([]);
  });

  it('1시간이 안 남았거나 이미 시작했으면 409와 "1시간"이 든 메시지, 예약은 남는다', async () => {
    const { store, b } = seeded();
    for (const now of ['2026-10-08T09:30:00+09:00', '2026-10-08T10:30:00+09:00']) {
      vi.useFakeTimers({ now: new Date(now) });
      const res = await del(store, b.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('1시간');
    }
    expect(store.list()).toEqual([b]);
  });

  it('없는 예약은 404', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T12:00:00+09:00') });
    const res = await del(new BookingStore(), 'bk-404');
    expect(res.status).toBe(404);
  });
});

describe('POST /bookings 주간 반복 예약', () => {
  const body = { ...slot, title: '주간 회의' };

  it('repeatWeeks가 n이면 201과 n개 예약의 배열을 첫 주부터 돌려준다', async () => {
    const store = new BookingStore();
    const res = await post({ ...body, repeatWeeks: 3 }, store);
    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((b: { start: string }) => Date.parse(b.start))).toEqual(
      ['2026-10-08', '2026-10-15', '2026-10-22'].map((d) => Date.parse(`${d}T09:00:00+09:00`)),
    );
    expect(res.body.map((b: { end: string }) => Date.parse(b.end))).toEqual(
      ['2026-10-08', '2026-10-15', '2026-10-22'].map((d) => Date.parse(`${d}T10:00:00+09:00`)),
    );
    expect(res.body[0]).toEqual({ id: 'bk-1', room: 'A', title: '주간 회의', start: slot.start, end: slot.end });
    expect(store.list()).toEqual(res.body);
  });

  it.each([1, 13, 2.5, '2', null, true])('repeatWeeks가 %s이면 400과 한국어 오류 메시지', async (repeatWeeks) => {
    const store = new BookingStore();
    const res = await post({ ...body, repeatWeeks }, store);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('repeatWeeks는 2~12의 정수여야 합니다');
    expect(store.list()).toEqual([]);
  });

  it('한 주라도 기존 예약과 겹치면 409, 아무것도 만들지 않는다', async () => {
    const store = new BookingStore();
    store.create({ ...body, title: '선약', start: '2026-10-22T09:30:00+09:00', end: '2026-10-22T10:30:00+09:00' });
    const res = await post({ ...body, repeatWeeks: 3 }, store);
    expect(res.status).toBe(409);
    expect(store.list()).toHaveLength(1);
  });

  it('규칙에 맞지 않으면 400, 아무것도 만들지 않는다', async () => {
    const store = new BookingStore();
    const res = await post({ ...body, end: '2026-10-08T09:10:00+09:00', repeatWeeks: 2 }, store);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DURATION_TOO_SHORT');
    expect(store.list()).toEqual([]);
  });

  it('repeatWeeks가 없으면 지금처럼 예약 하나를 객체로 돌려준다', async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'bk-1', ...body });
  });
});

async function patch(store: BookingStore, id: string, body: unknown) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'PATCH',
    url: `/bookings/${id}`,
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

describe('PATCH /bookings/:id 예약 변경', () => {
  const day = (time: string) => `2026-10-08T${time}:00+09:00`;

  /** A 회의실 10:00~11:00(bk-1), 13:00~14:00(bk-2) */
  function seeded() {
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '회의', start: day('10:00'), end: day('11:00') });
    const other = store.create({ room: 'A', title: '다른 회의', start: day('13:00'), end: day('14:00') });
    // 실패 뒤 상태를 비교할 스냅숏. store가 들고 있는 객체와 같은 참조면 제자리 변경을 잡지 못한다
    const before = structuredClone([b, other]);
    return { store, b, other, before };
  }

  it('준 필드만 바꾸고 200과 바뀐 예약 전체를 돌려준다. id는 그대로다', async () => {
    const { store, b } = seeded();
    const res = await patch(store, b.id, { title: '회고', end: day('12:00') });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'bk-1', room: 'A', title: '회고', start: day('10:00'), end: day('12:00') });
    expect(store.get('bk-1')).toEqual(res.body);
  });

  it('다른 예약과 겹치면 409, 자기 자신과는 겹침으로 보지 않는다', async () => {
    const { store, b, before } = seeded();
    const conflict = await patch(store, b.id, { end: day('13:30') });
    expect(conflict.status).toBe(409);
    expect(store.list()).toEqual(before);
    const self = await patch(store, b.id, { start: day('10:30'), end: day('11:30') });
    expect(self.status).toBe(200);
  });

  it('없는 예약이면 404', async () => {
    const { store, before } = seeded();
    const res = await patch(store, 'bk-404', { title: 't' });
    expect(res.status).toBe(404);
    expect(store.list()).toEqual(before);
  });

  it.each([{ title: '' }, { start: 'tomorrow' }, { start: '2026-10-08T11:00:00+09:00' }, { title: 1 }])(
    '%o이면 400과 한국어 오류 메시지, 예약은 그대로다',
    async (body) => {
      const { store, b, before } = seeded();
      const res = await patch(store, b.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/[가-힣]/);
      expect(store.list()).toEqual(before);
    },
  );

  it('본문이 객체가 아니면 400', async () => {
    const { store, b, before } = seeded();
    const res = await patch(store, b.id, null);
    expect(res.status).toBe(400);
    expect(store.get(b.id)).toEqual(before[0]);
  });

  it('변경 뒤에도 새 예약 id는 bk-3이다', async () => {
    const { store, b } = seeded();
    await patch(store, b.id, { title: '회고' });
    await patch(store, b.id, { end: day('13:30') });
    const res = await post({ ...slot, title: '새 회의', start: day('15:00'), end: day('16:00') }, store);
    expect(res.body.id).toBe('bk-3');
  });
});

describe('POST /bookings 참석 인원과 회의실 정원', () => {
  const body = { ...slot, title: '회의' };

  it('attendees를 주면 201과 attendees가 든 예약을 돌려준다', async () => {
    const res = await post({ ...body, attendees: 4 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'bk-1', ...body, attendees: 4 });
  });

  it.each([0, 2.5, '3', null])('attendees가 %s이면 400과 한국어 오류 메시지', async (attendees) => {
    const store = new BookingStore();
    const res = await post({ ...body, attendees }, store);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('attendees는 1 이상의 정수여야 합니다');
    expect(store.list()).toEqual([]);
  });

  it('정원(회의실 A 6명, B 10명)을 넘으면 400과 "정원"이 든 메시지, 예약은 만들지 않는다', async () => {
    const store = new BookingStore();
    const overA = await post({ ...body, attendees: 7 }, store);
    expect(overA.status).toBe(400);
    expect(overA.body.error).toContain('정원');
    const overB = await post({ ...body, room: 'B', attendees: 11 }, store);
    expect(overB.status).toBe(400);
    expect(overB.body.error).toContain('정원');
    expect(store.list()).toEqual([]);
  });

  it('정원과 같은 인원은 받는다', async () => {
    const store = new BookingStore();
    expect((await post({ ...body, attendees: 6 }, store)).status).toBe(201);
    expect((await post({ ...body, room: 'B', attendees: 10 }, store)).status).toBe(201);
  });

  it('반복 예약도 정원을 넘으면 400, 아무것도 만들지 않는다', async () => {
    const store = new BookingStore();
    const res = await post({ ...body, attendees: 7, repeatWeeks: 2 }, store);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('정원');
    expect(store.list()).toEqual([]);
  });

  it('정원을 모르는 회의실은 인원을 확인하지 않는다', async () => {
    const res = await post({ ...body, room: 'Z', attendees: 100 });
    expect(res.status).toBe(201);
    expect(res.body.attendees).toBe(100);
  });

  it('attendees가 없으면 인원을 확인하지 않고 응답에도 attendees가 없다', async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'bk-1', ...body });
  });
});
