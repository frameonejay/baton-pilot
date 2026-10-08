import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookingStore } from '../src/bookings.ts';
import { RoomStore } from '../src/rooms.ts';
import { handler } from '../src/server.ts';

describe('RoomStore', () => {
  it('있는 회의실을 돌려주고, 없는 회의실은 404', () => {
    const rooms = new RoomStore([{ id: 'A', name: '회의실 A', capacity: 6 }]);
    expect(rooms.get('A')).toEqual({ id: 'A', name: '회의실 A', capacity: 6 });
    expect(() => rooms.get('Z')).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('GET /rooms/:id', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer(handler(new BookingStore(), new RoomStore([{ id: 'A', name: '회의실 A', capacity: 6 }])));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('있는 회의실이면 200과 id, name, capacity를 돌려준다', async () => {
    const res = await fetch(`${base}/rooms/A`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'A', name: '회의실 A', capacity: 6 });
  });

  it('없는 회의실이면 404를 돌려준다', async () => {
    const res = await fetch(`${base}/rooms/Z`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Z') });
  });
});
