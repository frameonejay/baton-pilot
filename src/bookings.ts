/** 회의실 예약. 같은 회의실에서 시간이 겹치는 예약은 받지 않는다. */
export interface Booking {
  id: string;
  room: string;
  title: string;
  /** ISO 8601 */
  start: string;
  /** ISO 8601, start보다 뒤 */
  end: string;
}

export type BookingInput = Omit<Booking, 'id'>;

export class BookingError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const KST_OFFSET = 9 * HOUR;
const OPEN = 9 * HOUR;
const CLOSE = 18 * HOUR;

/** 한국 시간(+09:00) 기준 같은 날 09:00~18:00 안에 있는지. start, end는 epoch ms */
function withinBusinessHours(start: number, end: number): boolean {
  const day = Math.floor((start + KST_OFFSET) / DAY) * DAY - KST_OFFSET;
  return start >= day + OPEN && end <= day + CLOSE;
}

export class BookingStore {
  private readonly bookings = new Map<string, Booking>();
  private seq = 0;

  list(room?: string): Booking[] {
    const all = [...this.bookings.values()];
    return (room ? all.filter((b) => b.room === room) : all).sort((a, b) => a.start.localeCompare(b.start));
  }

  get(id: string): Booking {
    const found = this.bookings.get(id);
    if (!found) throw new BookingError(404, `예약 ${id}가 없습니다`);
    return found;
  }

  create(input: BookingInput): Booking {
    const start = Date.parse(input.start);
    const end = Date.parse(input.end);
    if (!input.room || !input.title) throw new BookingError(400, '회의실과 제목은 필수입니다');
    if (Number.isNaN(start) || Number.isNaN(end)) throw new BookingError(400, '시작·종료 시각 형식이 맞지 않습니다');
    if (end <= start) throw new BookingError(400, '종료 시각은 시작 시각보다 뒤여야 합니다');
    if (!withinBusinessHours(start, end)) {
      throw new BookingError(400, '예약은 업무 시간(한국 시간 09:00~18:00) 안에서만 할 수 있습니다');
    }

    const conflict = this.list(input.room).find((b) => Date.parse(b.start) < end && start < Date.parse(b.end));
    if (conflict) throw new BookingError(409, `${input.room}은 이미 예약돼 있습니다 (${conflict.id})`);

    this.seq += 1;
    const booking: Booking = { ...input, id: `bk-${this.seq}` };
    this.bookings.set(booking.id, booking);
    return booking;
  }

  cancel(id: string): void {
    this.get(id);
    this.bookings.delete(id);
  }
}
