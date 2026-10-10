import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BookingStore } from '../src/bookings.ts';
import { RoomStore } from '../src/rooms.ts';
import { handler } from '../src/server.ts';

async function get(url: string, rooms: RoomStore) {
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
  await handler(new BookingStore(), rooms)(req, res);
  return { status: out.status, body: out.body ? JSON.parse(out.body) : null };
}

describe('RoomStore', () => {
  it('id로 회의실을 찾고, 없으면 undefined', () => {
    const rooms = new RoomStore([{ id: 'A', name: '회의실 A', capacity: 6 }]);
    expect(rooms.get('A')).toEqual({ id: 'A', name: '회의실 A', capacity: 6 });
    expect(rooms.get('Z')).toBeUndefined();
  });

  it('기본 회의실 목록이 있다', () => {
    expect(new RoomStore().get('A')).toMatchObject({ id: 'A' });
  });
});

describe('GET /rooms/:id', () => {
  const rooms = new RoomStore([{ id: 'A', name: '회의실 A', capacity: 6 }]);

  it('있는 회의실이면 200과 id, name, capacity', async () => {
    const res = await get('/rooms/A', rooms);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'A', name: '회의실 A', capacity: 6 });
  });

  it('없는 회의실이면 404', async () => {
    const res = await get('/rooms/Z', rooms);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe('RoomStore.list', () => {
  const rooms = new RoomStore([
    { id: 'C', name: '회의실 C', capacity: 4 },
    { id: 'A', name: '회의실 A', capacity: 6 },
    { id: 'B', name: '회의실 B', capacity: 10 },
  ]);

  it('모든 회의실을 id 순으로 돌려준다', () => {
    expect(rooms.list().map((r) => r.id)).toEqual(['A', 'B', 'C']);
  });

  it('minCapacity를 주면 수용 인원이 그 이상인 회의실만 돌려준다', () => {
    expect(rooms.list(6).map((r) => r.id)).toEqual(['A', 'B']);
  });
});

describe('GET /rooms', () => {
  const rooms = new RoomStore([
    { id: 'C', name: '회의실 C', capacity: 4 },
    { id: 'A', name: '회의실 A', capacity: 6 },
    { id: 'B', name: '회의실 B', capacity: 10 },
  ]);

  it('200과 { items }를 id 순으로 돌려준다', async () => {
    const res = await get('/rooms', rooms);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        { id: 'A', name: '회의실 A', capacity: 6 },
        { id: 'B', name: '회의실 B', capacity: 10 },
        { id: 'C', name: '회의실 C', capacity: 4 },
      ],
    });
  });

  it('minCapacity=N이면 수용 인원이 N 이상인 회의실만 돌려준다', async () => {
    const res = await get('/rooms?minCapacity=6', rooms);
    expect(res.status).toBe(200);
    expect(res.body.items.map((r: { id: string }) => r.id)).toEqual(['A', 'B']);
  });

  it.each(['0', '-1', '1.5', 'abc', ''])('minCapacity=%s이면 400과 한국어 메시지', async (value) => {
    const res = await get(`/rooms?minCapacity=${value}`, rooms);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('minCapacity');
    expect(res.body.error).toMatch(/[가-힣]/);
  });

  it('조건에 맞는 회의실이 없으면 200과 빈 배열', async () => {
    const res = await get('/rooms?minCapacity=11', rooms);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });
});
