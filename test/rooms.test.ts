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
