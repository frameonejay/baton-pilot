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

export const TITLE_MAX_LENGTH = 100;

const MINUTE = 60 * 1000;
/** 예약 길이(종료 - 시작) 하한·상한. 경계값은 받는다. */
export const DURATION_MIN_MS = 15 * MINUTE;
export const DURATION_MAX_MS = 4 * 60 * MINUTE;

export class BookingError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    /** 클라이언트가 분기할 수 있는 오류 코드 */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'BookingError';
  }
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
    if (typeof input.title !== 'string' || !input.title.trim()) {
      throw new BookingError(400, '제목은 필수입니다', 'TITLE_REQUIRED');
    }
    if ([...input.title].length > TITLE_MAX_LENGTH) {
      throw new BookingError(400, `제목은 ${TITLE_MAX_LENGTH}자를 넘을 수 없습니다`, 'TITLE_TOO_LONG');
    }
    if (!input.room) throw new BookingError(400, '회의실은 필수입니다');
    if (Number.isNaN(start) || Number.isNaN(end)) throw new BookingError(400, '시작·종료 시각 형식이 맞지 않습니다');
    if (end <= start) throw new BookingError(400, '종료 시각은 시작 시각보다 뒤여야 합니다');
    if (end - start < DURATION_MIN_MS) {
      throw new BookingError(400, '예약은 15분 이상이어야 합니다', 'DURATION_TOO_SHORT');
    }
    if (end - start > DURATION_MAX_MS) {
      throw new BookingError(400, '예약은 4시간을 넘을 수 없습니다', 'DURATION_TOO_LONG');
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
