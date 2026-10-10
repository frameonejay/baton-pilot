import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { BookingError, type BookingInput, type BookingPatch, BookingStore } from './bookings.ts';
import { RoomStore } from './rooms.ts';

/** GET /bookings[?room=&limit=&offset=], POST /bookings, PATCH /bookings/:id, DELETE /bookings/:id, GET /rooms[?minCapacity=], GET /rooms/:id */
export function handler(store: BookingStore, rooms: RoomStore = new RoomStore()) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/bookings') {
        const limit = intParam(url.searchParams, 'limit', 20, 1, 100);
        const offset = intParam(url.searchParams, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
        const all = store.list(url.searchParams.get('room') ?? undefined);
        return send(res, 200, { items: all.slice(offset, offset + limit), total: all.length, limit, offset });
      }
      if (req.method === 'POST' && url.pathname === '/bookings') {
        const body = (await readJson(req)) as BookingInput & { repeatWeeks?: unknown };
        if (body.repeatWeeks === undefined) return send(res, 201, store.create(body));
        const { repeatWeeks, ...input } = body;
        return send(res, 201, store.createWeekly(input, repeatWeeks as number));
      }
      const match = url.pathname.match(/^\/bookings\/([\w-]+)$/);
      if (req.method === 'PATCH' && match?.[1]) {
        return send(res, 200, store.update(match[1], (await readJson(req)) as BookingPatch));
      }
      if (req.method === 'DELETE' && match?.[1]) {
        store.cancel(match[1]);
        return send(res, 204, null);
      }
      if (req.method === 'GET' && url.pathname === '/rooms') {
        const minCapacity = intParam(url.searchParams, 'minCapacity', 0, 1, Number.MAX_SAFE_INTEGER);
        return send(res, 200, { items: rooms.list(minCapacity) });
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

/** 쿼리 값이 없으면 기본값, 있으면 min~max 사이의 정수여야 한다 */
function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(value >= min && value <= max)) {
    const range = max === Number.MAX_SAFE_INTEGER ? `${min} 이상` : `${min}~${max}`;
    throw new BookingError(400, `${name}은 ${range}의 정수여야 합니다`);
  }
  return value;
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
