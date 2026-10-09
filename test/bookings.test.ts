import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingError, BookingStore } from '../src/bookings.ts';

const at = (hour: number, minute = 0) =>
  `2026-10-08T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`;

describe('BookingStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('취소한 예약은 사라지고, 없는 예약은 404', () => {
    vi.useFakeTimers({ now: new Date(at(8)) });
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '1', start: at(10), end: at(11) });
    store.cancel(b.id);
    expect(store.list()).toEqual([]);
    expect(() => store.cancel(b.id)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('시작까지 1시간 이상 남은 예약은 취소하고, 정확히 1시간 남은 예약도 취소한다', () => {
    const store = new BookingStore();
    const early = store.create({ room: 'A', title: '여유', start: at(12), end: at(13) });
    const edge = store.create({ room: 'B', title: '경계', start: at(11), end: at(12) });
    vi.useFakeTimers({ now: new Date(at(10)) });
    store.cancel(early.id);
    store.cancel(edge.id);
    expect(store.list()).toEqual([]);
  });

  it('시작까지 1시간이 안 남았거나 이미 시작한 예약은 409, 메시지에 "1시간", 예약은 남는다', () => {
    const store = new BookingStore();
    const soon = store.create({ room: 'A', title: '임박', start: at(11), end: at(12) });
    const started = store.create({ room: 'B', title: '진행 중', start: at(9), end: at(11) });
    vi.useFakeTimers({ now: new Date(Date.parse(at(10)) + 1) });
    for (const id of [soon.id, started.id]) {
      expect(() => store.cancel(id)).toThrow(
        expect.objectContaining({ status: 409, message: expect.stringContaining('1시간') }),
      );
    }
    expect(store.list().map((b) => b.id)).toEqual([started.id, soon.id]);
  });

  it('없는 예약을 취소하면 시각과 상관없이 404', () => {
    vi.useFakeTimers({ now: new Date(at(23)) });
    expect(() => new BookingStore().cancel('bk-404')).toThrow(expect.objectContaining({ status: 404 }));
  });
});
