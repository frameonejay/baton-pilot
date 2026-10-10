import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingError, BookingStore } from '../src/bookings.ts';

const at = (hour: number, minute = 0) =>
  `2026-10-08T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`;

describe('BookingStore', () => {
  it('예약을 만들고 시작 시각 순으로 돌려준다', () => {
    const store = new BookingStore();
    store.create({ room: 'A', title: '회고', start: at(15), end: at(16) });
    store.create({ room: 'A', title: '스탠드업', start: at(9), end: at(10) });
    expect(store.list('A').map((b) => b.title)).toEqual(['스탠드업', '회고']);
  });

  it('같은 회의실에서 겹치면 409, 다른 회의실이나 맞닿는 시간은 받는다', () => {
    const store = new BookingStore();
    store.create({ room: 'A', title: '1', start: at(10), end: at(11) });
    expect(() => store.create({ room: 'A', title: '2', start: at(10), end: at(12) })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
    expect(store.create({ room: 'B', title: '3', start: at(10), end: at(11) }).id).toBe('bk-2');
    expect(store.create({ room: 'A', title: '4', start: at(11), end: at(12) }).id).toBe('bk-3');
  });

  it('잘못된 입력은 400', () => {
    const store = new BookingStore();
    const bad = (input: Parameters<BookingStore['create']>[0]) => () => store.create(input);
    expect(bad({ room: '', title: 't', start: at(9), end: at(10) })).toThrow(BookingError);
    expect(bad({ room: 'A', title: 't', start: 'tomorrow', end: at(10) })).toThrow('형식');
    expect(bad({ room: 'A', title: 't', start: at(10), end: at(9) })).toThrow('뒤여야');
  });

  it('예약 길이가 15분보다 짧으면 400 DURATION_TOO_SHORT, 메시지에 "15분"', () => {
    const store = new BookingStore();
    expect(() => store.create({ room: 'A', title: 't', start: at(9), end: at(9, 14) })).toThrow(
      expect.objectContaining({ status: 400, code: 'DURATION_TOO_SHORT', message: expect.stringContaining('15분') }),
    );
  });

  it('예약 길이가 4시간을 넘으면 400 DURATION_TOO_LONG, 메시지에 "4시간"', () => {
    const store = new BookingStore();
    expect(() => store.create({ room: 'A', title: 't', start: at(9), end: at(13, 1) })).toThrow(
      expect.objectContaining({ status: 400, code: 'DURATION_TOO_LONG', message: expect.stringContaining('4시간') }),
    );
  });

  it('정확히 15분, 정확히 4시간인 예약은 받는다', () => {
    const store = new BookingStore();
    expect(store.create({ room: 'A', title: '짧게', start: at(9), end: at(9, 15) }).id).toBe('bk-1');
    expect(store.create({ room: 'B', title: '길게', start: at(9), end: at(13) }).id).toBe('bk-2');
  });

  it('한국 시간 09:00 시작, 18:00 종료인 예약은 받는다', () => {
    const store = new BookingStore();
    expect(store.create({ room: 'A', title: '아침', start: at(9), end: at(10) }).id).toBe('bk-1');
    expect(store.create({ room: 'A', title: '저녁', start: at(17), end: at(18) }).id).toBe('bk-2');
  });

  it('한국 시간 09:00 전에 시작하거나 18:00 뒤에 끝나면 400 OUTSIDE_BUSINESS_HOURS, 메시지에 "업무 시간"', () => {
    const store = new BookingStore();
    const outside = expect.objectContaining({
      status: 400,
      code: 'OUTSIDE_BUSINESS_HOURS',
      message: expect.stringContaining('업무 시간'),
    });
    expect(() => store.create({ room: 'A', title: 't', start: at(8, 59), end: at(10) })).toThrow(outside);
    expect(() => store.create({ room: 'A', title: 't', start: at(17), end: at(18, 1) })).toThrow(outside);
  });

  it('한국 시간으로 같은 날 안에 있지 않으면 400 OUTSIDE_BUSINESS_HOURS', () => {
    const store = new BookingStore();
    expect(() =>
      store.create({ room: 'A', title: 't', start: '2026-10-08T17:00:00+09:00', end: '2026-10-09T09:30:00+09:00' }),
    ).toThrow(expect.objectContaining({ status: 400, code: 'OUTSIDE_BUSINESS_HOURS' }));
  });

  it('업무 시간 밖이면서 길이도 어긋나면 길이 오류보다 OUTSIDE_BUSINESS_HOURS가 먼저 나온다', () => {
    const store = new BookingStore();
    const outside = expect.objectContaining({
      status: 400,
      code: 'OUTSIDE_BUSINESS_HOURS',
      message: expect.stringContaining('업무 시간'),
    });
    // 20:00~20:10: 15분보다 짧다
    expect(() => store.create({ room: 'A', title: 't', start: at(20), end: at(20, 10) })).toThrow(outside);
    // 17:00~다음날 10:00: 4시간을 넘는다
    expect(() => store.create({ room: 'A', title: 't', start: at(17), end: '2026-10-09T10:00:00+09:00' })).toThrow(
      outside,
    );
  });

  it('업무 시간 안에서 길이만 어긋나면 기존 길이 오류가 나온다', () => {
    const store = new BookingStore();
    expect(() => store.create({ room: 'A', title: 't', start: at(17, 50), end: at(18) })).toThrow(
      expect.objectContaining({ status: 400, code: 'DURATION_TOO_SHORT', message: expect.stringContaining('15분') }),
    );
    expect(() => store.create({ room: 'A', title: 't', start: at(13), end: at(18) })).toThrow(
      expect.objectContaining({ status: 400, code: 'DURATION_TOO_LONG', message: expect.stringContaining('4시간') }),
    );
  });

  it('Z 등 다른 오프셋으로 적은 시각도 한국 시간으로 바꿔 판단한다', () => {
    const store = new BookingStore();
    // 00:00Z = 09:00 KST, 09:00Z = 18:00 KST
    expect(store.create({ room: 'A', title: 'Z', start: '2026-10-08T00:00:00Z', end: '2026-10-08T01:00:00Z' }).id).toBe(
      'bk-1',
    );
    expect(
      store.create({ room: 'A', title: '+01', start: '2026-10-08T09:00:00+01:00', end: '2026-10-08T10:00:00+01:00' })
        .id,
    ).toBe('bk-2');
    // 10:00Z~11:00Z = 19:00~20:00 KST: UTC로는 업무 시간이지만 한국 시간으로는 아니다
    expect(() =>
      store.create({ room: 'A', title: 't', start: '2026-10-08T10:00:00Z', end: '2026-10-08T11:00:00Z' }),
    ).toThrow(expect.objectContaining({ status: 400, code: 'OUTSIDE_BUSINESS_HOURS' }));
    // 23:30Z(전날)~00:30Z = 08:30~09:30 KST
    expect(() =>
      store.create({ room: 'B', title: 't', start: '2026-10-07T23:30:00Z', end: '2026-10-08T00:30:00Z' }),
    ).toThrow(expect.objectContaining({ status: 400, code: 'OUTSIDE_BUSINESS_HOURS' }));
  });

  it('취소한 예약은 사라지고, 없는 예약은 404', () => {
    vi.useFakeTimers({ now: new Date(at(8)) });
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '1', start: at(10), end: at(11) });
    store.cancel(b.id);
    expect(store.list()).toEqual([]);
    expect(() => store.cancel(b.id)).toThrow(expect.objectContaining({ status: 404 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('BookingStore 취소 정책', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const seeded = () => {
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '1', start: at(10), end: at(11) });
    return { store, b };
  };
  const tooLate = expect.objectContaining({ status: 409, message: expect.stringContaining('1시간') });

  it('시작까지 1시간보다 많이 남으면 취소한다', () => {
    vi.useFakeTimers({ now: new Date(at(8, 59)) });
    const { store, b } = seeded();
    store.cancel(b.id);
    expect(store.list()).toEqual([]);
  });

  it('시작까지 정확히 1시간 남은 예약도 취소한다', () => {
    vi.useFakeTimers({ now: new Date(at(9)) });
    const { store, b } = seeded();
    store.cancel(b.id);
    expect(store.list()).toEqual([]);
  });

  it('시작까지 1시간이 안 남았으면 409, 메시지에 "1시간", 예약은 남는다', () => {
    vi.useFakeTimers({ now: Date.parse(at(9)) + 1 });
    const { store, b } = seeded();
    expect(() => store.cancel(b.id)).toThrow(tooLate);
    expect(store.list()).toEqual([b]);
  });

  it('이미 시작했거나 끝난 예약은 409, 예약은 남는다', () => {
    const { store, b } = seeded();
    vi.useFakeTimers({ now: new Date(at(10)) });
    expect(() => store.cancel(b.id)).toThrow(tooLate);
    vi.setSystemTime(new Date(at(12)));
    expect(() => store.cancel(b.id)).toThrow(tooLate);
    expect(store.list()).toEqual([b]);
  });

  it('없는 예약은 시각과 상관없이 404', () => {
    vi.useFakeTimers({ now: new Date(at(12)) });
    const store = new BookingStore();
    expect(() => store.cancel('bk-404')).toThrow(expect.objectContaining({ status: 404 }));
  });
});
