/** 회의실 예약. 같은 회의실에서 시간이 겹치는 예약은 받지 않는다. */
export interface Booking {
  id: string;
  room: string;
  title: string;
  /** ISO 8601 */
  start: string;
  /** ISO 8601, start보다 뒤 */
  end: string;
  /** 참석 인원. 선택, 1 이상의 정수 */
  attendees?: number;
}

export type BookingInput = Omit<Booking, 'id'>;

/** 예약 변경에서 바꿀 수 있는 필드. 준 것만 바꾼다. */
export type BookingPatch = Partial<Pick<Booking, 'title' | 'start' | 'end'>>;

const MINUTE = 60 * 1000;
/** 예약 길이(종료 - 시작) 하한·상한. 경계값은 받는다. */
export const DURATION_MIN_MS = 15 * MINUTE;
export const DURATION_MAX_MS = 4 * 60 * MINUTE;

const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** 시작 시각까지 이만큼 이상 남아야 취소할 수 있다 */
const CANCEL_DEADLINE_MS = HOUR;
/** 업무 시간은 한국 시간(+09:00) 기준 같은 날 09:00~18:00. 경계값은 받는다. */
const KST_OFFSET_MS = 9 * HOUR;
const BUSINESS_OPEN_MS = 9 * HOUR;
const BUSINESS_CLOSE_MS = 18 * HOUR;

/** 주간 반복 예약 횟수(repeatWeeks) 하한·상한. 경계값은 받는다. */
export const REPEAT_WEEKS_MIN = 2;
export const REPEAT_WEEKS_MAX = 12;

/** ISO 시각을 days일 옮긴다. 입력에 적힌 오프셋(+09:00 등)을 그대로 쓴다. */
function shiftDays(iso: string, days: number): string {
  if (days === 0) return iso;
  const shifted = Date.parse(iso) + days * DAY;
  const offset = iso.match(/[+-](\d{2}):(\d{2})$/);
  if (!offset) return new Date(shifted).toISOString();
  const sign = offset[0].startsWith('-') ? -1 : 1;
  const offsetMs = sign * (Number(offset[1]) * HOUR + Number(offset[2]) * MINUTE);
  return new Date(shifted + offsetMs).toISOString().replace('Z', offset[0]);
}

/** 시작 시각이 속한 한국 날짜의 업무 시간 안에 시작·종료가 모두 들어가는지 */
function withinBusinessHours(start: number, end: number): boolean {
  const kstMidnight = Math.floor((start + KST_OFFSET_MS) / DAY) * DAY - KST_OFFSET_MS;
  return start >= kstMidnight + BUSINESS_OPEN_MS && end <= kstMidnight + BUSINESS_CLOSE_MS;
}

/** attendees는 없거나 1 이상의 정수여야 한다. capacity(회의실 정원)를 알면 그 이하여야 한다. */
export function checkAttendees(attendees: unknown, capacity?: number): void {
  if (attendees === undefined) return;
  if (typeof attendees !== 'number' || !Number.isInteger(attendees) || attendees < 1) {
    throw new BookingError(400, 'attendees는 1 이상의 정수여야 합니다');
  }
  if (capacity !== undefined && attendees > capacity) {
    throw new BookingError(400, `참석 인원 ${attendees}명이 회의실 정원 ${capacity}명을 넘습니다`);
  }
}

export class BookingError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    /** 클라이언트가 분기할 수 있는 오류 코드 (예약 길이·업무 시간 검증) */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

export class BookingStore {
  private readonly bookings = new Map<string, Booking>();
  private seq = 0;

  /** 실제 시작 시각 순. 같으면 먼저 만든 예약이 앞이다 (Map은 넣은 순서를 지키고 sort는 안정 정렬이다). */
  list(room?: string): Booking[] {
    const all = [...this.bookings.values()];
    return (room ? all.filter((b) => b.room === room) : all).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  get(id: string): Booking {
    const found = this.bookings.get(id);
    if (!found) throw new BookingError(404, `예약 ${id}가 없습니다`);
    return found;
  }

  create(input: BookingInput): Booking {
    this.validate(input);
    return this.insert(input);
  }

  /** 시작·종료를 7일씩 옮겨 weeks개를 첫 주부터 만든다. 하나라도 안 되면 아무것도 만들지 않는다. */
  createWeekly(input: BookingInput, weeks: number): Booking[] {
    if (!Number.isInteger(weeks) || weeks < REPEAT_WEEKS_MIN || weeks > REPEAT_WEEKS_MAX) {
      throw new BookingError(400, `repeatWeeks는 ${REPEAT_WEEKS_MIN}~${REPEAT_WEEKS_MAX}의 정수여야 합니다`);
    }
    this.validate(input);
    const inputs = Array.from({ length: weeks }, (_, i) => ({
      ...input,
      start: shiftDays(input.start, 7 * i),
      end: shiftDays(input.end, 7 * i),
    }));
    for (const each of inputs) this.validate(each);
    return inputs.map((each) => this.insert(each));
  }

  /** title·start·end 중 준 것만 바꾼다. 회의실과 id는 그대로다. 실패하면 아무것도 바꾸지 않는다. */
  update(id: string, patch: BookingPatch): Booking {
    const current = this.get(id);
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new BookingError(400, '본문은 객체여야 합니다');
    }
    const changes: BookingPatch = {};
    for (const key of ['title', 'start', 'end'] as const) {
      const value: unknown = patch[key];
      if (value === undefined) continue;
      if (typeof value !== 'string') throw new BookingError(400, `${key}는 문자열이어야 합니다`);
      changes[key] = value;
    }
    const updated: Booking = { ...current, ...changes };
    this.validate(updated, id);
    this.bookings.set(id, updated);
    return updated;
  }

  /** 입력 규칙과 같은 회의실의 겹침을 확인한다. 저장하지 않는다. excludeId 예약과는 겹침으로 보지 않는다. */
  private validate(input: BookingInput, excludeId?: string): void {
    const start = Date.parse(input.start);
    const end = Date.parse(input.end);
    if (!input.room || !input.title) throw new BookingError(400, '회의실과 제목은 필수입니다');
    checkAttendees(input.attendees);
    if (Number.isNaN(start) || Number.isNaN(end)) throw new BookingError(400, '시작·종료 시각 형식이 맞지 않습니다');
    if (end <= start) throw new BookingError(400, '종료 시각은 시작 시각보다 뒤여야 합니다');
    if (!withinBusinessHours(start, end)) {
      throw new BookingError(
        400,
        '예약은 업무 시간(한국 시간 09:00~18:00) 안에 있어야 합니다',
        'OUTSIDE_BUSINESS_HOURS',
      );
    }
    const duration = end - start;
    if (duration < DURATION_MIN_MS) {
      throw new BookingError(400, '예약은 15분 이상이어야 합니다', 'DURATION_TOO_SHORT');
    }
    if (duration > DURATION_MAX_MS) {
      throw new BookingError(400, '예약은 4시간을 넘을 수 없습니다', 'DURATION_TOO_LONG');
    }

    const conflict = this.list(input.room).find(
      (b) => b.id !== excludeId && Date.parse(b.start) < end && start < Date.parse(b.end),
    );
    if (conflict) throw new BookingError(409, `${input.room}은 이미 예약돼 있습니다 (${conflict.id})`);
  }

  private insert(input: BookingInput): Booking {
    this.seq += 1;
    const booking: Booking = { ...input, id: `bk-${this.seq}` };
    this.bookings.set(booking.id, booking);
    return booking;
  }

  /** 시작까지 1시간 이상 남은 예약만 취소한다. 정확히 1시간 남았으면 받는다. */
  cancel(id: string): void {
    const booking = this.get(id);
    if (Date.parse(booking.start) - Date.now() < CANCEL_DEADLINE_MS) {
      throw new BookingError(409, '시작 1시간 전부터는 예약을 취소할 수 없습니다');
    }
    this.bookings.delete(id);
  }
}
