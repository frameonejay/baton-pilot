import { describe, expect, it } from 'vitest';
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

  it('취소한 예약은 사라지고, 없는 예약은 404', () => {
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '1', start: at(10), end: at(11) });
    store.cancel(b.id);
    expect(store.list()).toEqual([]);
    expect(() => store.cancel(b.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('BookingStore.createWeekly', () => {
  const weekly = { room: 'A', title: '주간 회의', start: at(10), end: at(11) };

  it('repeatWeeks가 2~12의 정수가 아니면 400', () => {
    const store = new BookingStore();
    for (const weeks of [1, 13, 0, -2, 2.5, '3', null, Number.NaN]) {
      expect(() => store.createWeekly(weekly, weeks)).toThrow(expect.objectContaining({ status: 400 }));
    }
    expect(store.list()).toEqual([]);
  });

  it('주 단위로 시작·종료를 7일씩 옮겨 n개를 첫 주부터 만든다', () => {
    const store = new BookingStore();
    const created = store.createWeekly(weekly, 3);
    expect(created.map((b) => [b.start, b.end])).toEqual([
      ['2026-10-08T10:00:00+09:00', '2026-10-08T11:00:00+09:00'],
      ['2026-10-15T10:00:00+09:00', '2026-10-15T11:00:00+09:00'],
      ['2026-10-22T10:00:00+09:00', '2026-10-22T11:00:00+09:00'],
    ]);
    expect(created.map((b) => b.id)).toEqual(['bk-1', 'bk-2', 'bk-3']);
    expect(store.list('A')).toEqual(created);
  });

  it('경계값 2주, 12주는 받고 월말을 넘겨도 날짜를 맞게 옮긴다', () => {
    const store = new BookingStore();
    expect(store.createWeekly(weekly, 2)).toHaveLength(2);
    const twelve = store.createWeekly(
      { ...weekly, room: 'B', start: '2026-12-31T10:00:00Z', end: '2026-12-31T11:00:00Z' },
      12,
    );
    expect(twelve).toHaveLength(12);
    expect(twelve[1]?.start).toBe('2027-01-07T10:00:00Z');
    expect(twelve[11]?.start).toBe('2027-03-18T10:00:00Z');
  });

  it('한 주라도 기존 예약과 겹치면 409이고 아무것도 만들지 않는다', () => {
    const store = new BookingStore();
    const existing = store.create({
      room: 'A',
      title: '기존',
      start: '2026-10-22T10:30:00+09:00',
      end: '2026-10-22T12:00:00+09:00',
    });
    expect(() => store.createWeekly(weekly, 4)).toThrow(expect.objectContaining({ status: 409 }));
    expect(store.list()).toEqual([existing]);
  });

  it('규칙에 맞지 않으면 400이고 아무것도 만들지 않는다', () => {
    const store = new BookingStore();
    expect(() => store.createWeekly({ ...weekly, end: at(10, 10) }, 3)).toThrow(
      expect.objectContaining({ status: 400, code: 'DURATION_TOO_SHORT' }),
    );
    expect(() => store.createWeekly({ ...weekly, title: '' }, 3)).toThrow(expect.objectContaining({ status: 400 }));
    expect(store.list()).toEqual([]);
  });
});
