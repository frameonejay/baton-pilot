import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { BookingError, type BookingInput, BookingStore } from './bookings.ts';
import { RoomStore } from './rooms.ts';

/** GET /bookings[?room=], POST /bookings[repeatWeeks], DELETE /bookings/:id, GET /rooms/:id */
export function handler(store: BookingStore, rooms: RoomStore = new RoomStore()) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/bookings') {
        return send(res, 200, store.list(url.searchParams.get('room') ?? undefined));
      }
      if (req.method === 'POST' && url.pathname === '/bookings') {
        const { repeatWeeks, ...input } = (await readJson(req)) as BookingInput & { repeatWeeks?: unknown };
        if (repeatWeeks === undefined) return send(res, 201, store.create(input));
        return send(res, 201, store.createWeekly(input, repeatWeeks));
      }
      const match = url.pathname.match(/^\/bookings\/([\w-]+)$/);
      if (req.method === 'DELETE' && match?.[1]) {
        store.cancel(match[1]);
        return send(res, 204, null);
      }
      const roomMatch = url.pathname.match(/^\/rooms\/([\w-]+)$/);
      if (req.method === 'GET' && roomMatch?.[1]) {
        const room = rooms.get(roomMatch[1]);
        if (!room) return send(res, 404, { error: `회의실 ${roomMatch[1]}가 없습니다` });
        return send(res, 200, { id: room.id, name: room.name, capacity: room.capacity });
      }
      return send(res, 404, { error: '없는 경로입니다' });
    } catch (error) {
      if (error instanceof BookingError) return send(res, error.status, { error: error.message, code: error.code });
      return send(res, 500, { error: '서버 오류' });
    }
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new BookingError(400, '본문이 JSON이 아닙니다');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, body === null ? {} : { 'content-type': 'application/json' });
  res.end(body === null ? undefined : JSON.stringify(body));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createServer(handler(new BookingStore())).listen(port, () => console.log(`http://localhost:${port}`));
}
