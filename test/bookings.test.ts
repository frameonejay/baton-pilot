import { describe, expect, it } from 'vitest';
import { BookingError, BookingStore } from '../src/bookings.ts';

const at = (hour: number) => `2026-10-08T${String(hour).padStart(2, '0')}:00:00+09:00`;

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

  it('취소한 예약은 사라지고, 없는 예약은 404', () => {
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '1', start: at(10), end: at(11) });
    store.cancel(b.id);
    expect(store.list()).toEqual([]);
    expect(() => store.cancel(b.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('BookingStore 업무 시간', () => {
  const create = (start: string, end: string) => () =>
    new BookingStore().create({ room: 'A', title: 't', start, end });

  it('한국 시간 09:00 시작, 18:00 종료는 받는다', () => {
    expect(create(at(9), at(18))().id).toBe('bk-1');
  });

  it('한국 시간 09:00 전에 시작하거나 18:00 뒤에 끝나면 400', () => {
    const before = create('2026-10-08T08:59:00+09:00', at(10));
    expect(before).toThrow(expect.objectContaining({ status: 400 }));
    expect(before).toThrow('업무 시간');
    const after = create(at(17), '2026-10-08T18:00:01+09:00');
    expect(after).toThrow(expect.objectContaining({ status: 400 }));
    expect(after).toThrow('업무 시간');
  });

  it('한국 시간으로 날짜가 바뀌면 400', () => {
    expect(create(at(17), '2026-10-09T10:00:00+09:00')).toThrow('업무 시간');
  });

  it('Z 등 다른 오프셋은 한국 시간으로 바꿔 판단한다', () => {
    // 00:00Z = 09:00 KST, 09:00Z = 18:00 KST
    expect(create('2026-10-08T00:00:00Z', '2026-10-08T09:00:00Z')().id).toBe('bk-1');
    // 01:00+01:00 = 00:00Z = 09:00 KST
    expect(create('2026-10-08T01:00:00+01:00', '2026-10-08T02:00:00+01:00')().id).toBe('bk-1');
    // 10:00Z = 19:00 KST, 23:30Z(전날) = 08:30 KST
    expect(create('2026-10-08T10:00:00Z', '2026-10-08T11:00:00Z')).toThrow('업무 시간');
    expect(create('2026-10-07T23:30:00Z', '2026-10-08T01:00:00Z')).toThrow('업무 시간');
    // 표기상 업무 시간이어도 한국 시간으로는 밖: 10:00-05:00 = 15:00Z = 00:00 KST(다음 날)
    expect(create('2026-10-08T10:00:00-05:00', '2026-10-08T11:00:00-05:00')).toThrow('업무 시간');
  });
});
