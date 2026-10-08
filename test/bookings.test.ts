import { describe, expect, it } from 'vitest';
import { BookingError, type BookingInput, BookingStore } from '../src/bookings.ts';

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

  it('제목이 없거나 공백뿐이면 400 TITLE_REQUIRED', () => {
    const store = new BookingStore();
    const titleRequired = expect.objectContaining({ status: 400, code: 'TITLE_REQUIRED' });
    expect(() => store.create({ room: 'A', title: '', start: at(9), end: at(10) })).toThrow(titleRequired);
    expect(() => store.create({ room: 'A', title: '  \t ', start: at(9), end: at(10) })).toThrow(titleRequired);
    const noTitle = { room: 'A', start: at(9), end: at(10) } as unknown as BookingInput;
    expect(() => store.create(noTitle)).toThrow(titleRequired);
  });

  it('제목이 100자를 넘으면 400 TITLE_TOO_LONG, 100자 정확히는 받는다', () => {
    const store = new BookingStore();
    expect(() => store.create({ room: 'A', title: '가'.repeat(101), start: at(9), end: at(10) })).toThrow(
      expect.objectContaining({ status: 400, code: 'TITLE_TOO_LONG' }),
    );
    expect(store.create({ room: 'A', title: '가'.repeat(100), start: at(9), end: at(10) }).title).toHaveLength(100);
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
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '1', start: at(10), end: at(11) });
    store.cancel(b.id);
    expect(store.list()).toEqual([]);
    expect(() => store.cancel(b.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
