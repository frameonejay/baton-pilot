import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { BookingError, type BookingInput, BookingStore } from './bookings.ts';

/** GET /bookings[?room=], POST /bookings, DELETE /bookings/:id */
export function handler(store: BookingStore) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/bookings') {
        return send(res, 200, store.list(url.searchParams.get('room') ?? undefined));
      }
      if (req.method === 'POST' && url.pathname === '/bookings') {
        return send(res, 201, store.create((await readJson(req)) as BookingInput));
      }
      const match = url.pathname.match(/^\/bookings\/([\w-]+)$/);
      if (req.method === 'DELETE' && match?.[1]) {
        store.cancel(match[1]);
        return send(res, 204, null);
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
