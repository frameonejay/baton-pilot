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

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
/** 예약 길이(종료 - 시작) 하한·상한. 경계값은 받는다. */
export const DURATION_MIN_MS = 15 * MINUTE;
export const DURATION_MAX_MS = 4 * 60 * MINUTE;

/** repeatWeeks 하한·상한. 경계값은 받는다. */
export const REPEAT_WEEKS_MIN = 2;
export const REPEAT_WEEKS_MAX = 12;

/** ISO 8601 시각의 날짜만 days일 옮긴다. 시각과 오프셋 표기는 그대로 둔다. */
function shiftDays(iso: string, days: number): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(Date.parse(iso) + days * DAY).toISOString();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10) + iso.slice(10);
}

export class BookingError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    /** 클라이언트가 분기할 수 있는 오류 코드 (예약 길이 검증) */
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
    this.check(input);
    return this.insert(input);
  }

  /** 시작·종료를 7일씩 옮겨 weeks(2~12)개를 첫 주부터 만든다. 하나라도 안 되면 아무것도 만들지 않는다. */
  createWeekly(input: BookingInput, weeks: unknown): Booking[] {
    if (typeof weeks !== 'number' || !Number.isInteger(weeks) || weeks < REPEAT_WEEKS_MIN || weeks > REPEAT_WEEKS_MAX) {
      throw new BookingError(400, `repeatWeeks는 ${REPEAT_WEEKS_MIN}~${REPEAT_WEEKS_MAX}의 정수여야 합니다`);
    }
    const inputs = Array.from({ length: weeks }, (_, i) => ({
      ...input,
      start: shiftDays(input.start, 7 * i),
      end: shiftDays(input.end, 7 * i),
    }));
    // 각 주가 서로 겹치지 않으므로(최대 4시간) 기존 예약과만 비교하면 된다
    for (const each of inputs) this.check(each);
    return inputs.map((each) => this.insert(each));
  }

  /** 입력 규칙과 기존 예약과의 충돌을 확인한다. 어긋나면 BookingError. */
  private check(input: BookingInput): void {
    const start = Date.parse(input.start);
    const end = Date.parse(input.end);
    if (!input.room || !input.title) throw new BookingError(400, '회의실과 제목은 필수입니다');
    if (Number.isNaN(start) || Number.isNaN(end)) throw new BookingError(400, '시작·종료 시각 형식이 맞지 않습니다');
    if (end <= start) throw new BookingError(400, '종료 시각은 시작 시각보다 뒤여야 합니다');
    const duration = end - start;
    if (duration < DURATION_MIN_MS) {
      throw new BookingError(400, '예약은 15분 이상이어야 합니다', 'DURATION_TOO_SHORT');
    }
    if (duration > DURATION_MAX_MS) {
      throw new BookingError(400, '예약은 4시간을 넘을 수 없습니다', 'DURATION_TOO_LONG');
    }

    const conflict = this.list(input.room).find((b) => Date.parse(b.start) < end && start < Date.parse(b.end));
    if (conflict) throw new BookingError(409, `${input.room}은 이미 예약돼 있습니다 (${conflict.id})`);
  }

  private insert(input: BookingInput): Booking {
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
