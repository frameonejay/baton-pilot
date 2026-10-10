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

  it('오프셋이 다른 시각이 섞여도 실제 시각 순으로 돌려준다', () => {
    const store = new BookingStore();
    // 02:00Z = 11:00 KST, 10:00+09:00 = 01:00Z: 문자열로는 Z가 앞이지만 실제로는 뒤다
    store.create({ room: 'A', title: '11시', start: '2026-10-08T02:00:00Z', end: '2026-10-08T03:00:00Z' });
    store.create({ room: 'A', title: '10시', start: at(10), end: at(11) });
    store.create({ room: 'A', title: '9시', start: '2026-10-08T01:00:00+01:00', end: '2026-10-08T02:00:00+01:00' });
    expect(store.list('A').map((b) => b.title)).toEqual(['9시', '10시', '11시']);
  });

  it('시작 시각이 같으면 먼저 만든 예약이 앞이다', () => {
    const store = new BookingStore();
    // 10:00+09:00과 01:00Z는 같은 시각이다
    store.create({ room: 'B', title: '첫째', start: at(10), end: at(11) });
    store.create({ room: 'A', title: '둘째', start: '2026-10-08T01:00:00Z', end: '2026-10-08T02:00:00Z' });
    store.create({ room: 'C', title: '셋째', start: at(10), end: at(11) });
    expect(store.list().map((b) => b.title)).toEqual(['첫째', '둘째', '셋째']);
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

describe('BookingStore 주간 반복 예약', () => {
  const week = (n: number, hour: number) =>
    `2026-10-${String(8 + 7 * n).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+09:00`;
  const base = { room: 'A', title: '주간 회의', start: week(0, 10), end: week(0, 11) };

  it('시작·종료를 7일씩 옮겨 n개를 첫 주부터 만든다', () => {
    const store = new BookingStore();
    const created = store.createWeekly(base, 3);
    expect(created.map((b) => [b.id, b.room, b.title])).toEqual([
      ['bk-1', 'A', '주간 회의'],
      ['bk-2', 'A', '주간 회의'],
      ['bk-3', 'A', '주간 회의'],
    ]);
    expect(created.map((b) => [Date.parse(b.start), Date.parse(b.end)])).toEqual(
      [0, 1, 2].map((n) => [Date.parse(week(n, 10)), Date.parse(week(n, 11))]),
    );
    expect(store.list('A')).toEqual(created);
  });

  it('입력한 시각의 오프셋을 그대로 쓴다', () => {
    const created = new BookingStore().createWeekly(base, 2);
    expect(created[0]).toMatchObject({ start: base.start, end: base.end });
    expect(created[1]).toMatchObject({ start: '2026-10-15T10:00:00.000+09:00', end: '2026-10-15T11:00:00.000+09:00' });
  });

  it('경계값 2와 12를 받는다', () => {
    expect(new BookingStore().createWeekly(base, 2)).toHaveLength(2);
    expect(new BookingStore().createWeekly(base, 12)).toHaveLength(12);
  });

  it.each([1, 13, 0, -2, 2.5, '3', null, Number.NaN])('repeatWeeks가 %s이면 400, 아무것도 만들지 않는다', (weeks) => {
    const store = new BookingStore();
    expect(() => store.createWeekly(base, weeks as number)).toThrow(
      expect.objectContaining({ status: 400, message: 'repeatWeeks는 2~12의 정수여야 합니다' }),
    );
    expect(store.list()).toEqual([]);
  });

  it('어느 한 주라도 기존 예약과 겹치면 409, 아무것도 만들지 않는다', () => {
    const store = new BookingStore();
    const existing = store.create({ room: 'A', title: '선약', start: week(2, 10), end: week(2, 12) });
    expect(() => store.createWeekly(base, 4)).toThrow(expect.objectContaining({ status: 409 }));
    expect(store.list()).toEqual([existing]);
    expect(store.createWeekly({ ...base, room: 'B' }, 4)).toHaveLength(4);
  });

  it('규칙에 맞지 않으면 기존 오류 그대로 400, 아무것도 만들지 않는다', () => {
    const store = new BookingStore();
    expect(() => store.createWeekly({ ...base, end: week(0, 19) }, 2)).toThrow(
      expect.objectContaining({ status: 400, code: 'OUTSIDE_BUSINESS_HOURS' }),
    );
    expect(() => store.createWeekly({ ...base, start: 'tomorrow' }, 2)).toThrow('형식');
    expect(store.list()).toEqual([]);
  });
});

describe('BookingStore 예약 변경', () => {
  const seeded = () => {
    const store = new BookingStore();
    const b = store.create({ room: 'A', title: '회의', start: at(10), end: at(11) });
    const other = store.create({ room: 'A', title: '다른 회의', start: at(13), end: at(14) });
    // 실패 뒤 상태를 비교할 스냅숏. store가 들고 있는 객체와 같은 참조면 제자리 변경을 잡지 못한다
    const before = structuredClone([b, other]);
    return { store, b, other, before };
  };

  it('준 필드만 바꾸고 바뀐 예약 전체를 돌려준다. id와 회의실은 그대로다', () => {
    const { store, b } = seeded();
    expect(store.update(b.id, { title: '회고' })).toEqual({ ...b, title: '회고' });
    expect(store.update(b.id, { start: at(9), end: at(10, 30) })).toEqual({
      ...b,
      title: '회고',
      start: at(9),
      end: at(10, 30),
    });
    expect(store.get(b.id)).toEqual({ id: 'bk-1', room: 'A', title: '회고', start: at(9), end: at(10, 30) });
  });

  it('본문의 room·id는 무시한다', () => {
    const { store, b } = seeded();
    const patch = { room: 'B', id: 'bk-99', end: at(12) } as Parameters<BookingStore['update']>[1];
    expect(store.update(b.id, patch)).toEqual({ ...b, end: at(12) });
    expect(() => store.get('bk-99')).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('같은 회의실의 다른 예약과 겹치면 409, 예약은 그대로다', () => {
    const { store, b, before } = seeded();
    expect(() => store.update(b.id, { end: at(13, 30) })).toThrow(expect.objectContaining({ status: 409 }));
    expect(store.list()).toEqual(before);
  });

  it('자기 자신과는 겹침으로 보지 않고, 맞닿는 시간이나 다른 회의실 예약은 받는다', () => {
    const { store, b } = seeded();
    store.create({ room: 'B', title: 'B 회의', start: at(11), end: at(12) });
    expect(store.update(b.id, { start: at(10, 30), end: at(11, 30) })).toMatchObject({ start: at(10, 30) });
    expect(store.update(b.id, { end: at(13) })).toMatchObject({ end: at(13) });
  });

  it('없는 예약은 404', () => {
    const { store } = seeded();
    expect(() => store.update('bk-404', { title: 't' })).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('바꾼 결과가 생성 규칙에 맞지 않으면 400, 예약은 그대로다', () => {
    const { store, b, before } = seeded();
    const bad = (patch: Parameters<BookingStore['update']>[1]) => () => store.update(b.id, patch);
    expect(bad({ title: '' })).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining('제목') }),
    );
    expect(bad({ start: 'tomorrow' })).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining('형식') }),
    );
    expect(bad({ start: at(11) })).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining('뒤여야') }),
    );
    expect(bad({ end: at(10, 10) })).toThrow(expect.objectContaining({ status: 400, code: 'DURATION_TOO_SHORT' }));
    expect(bad({ end: at(18, 30) })).toThrow(expect.objectContaining({ status: 400, code: 'OUTSIDE_BUSINESS_HOURS' }));
    expect(store.list()).toEqual(before);
  });

  it('문자열이 아닌 title·start·end는 400', () => {
    const { store, b, before } = seeded();
    for (const patch of [{ title: 1 }, { start: 1 }, { end: null }]) {
      expect(() => store.update(b.id, patch as unknown as Parameters<BookingStore['update']>[1])).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    }
    expect(store.get(b.id)).toEqual(before[0]);
  });

  it('변경은 새 예약의 id 순번을 건너뛰게 하지 않는다', () => {
    const { store, b } = seeded();
    store.update(b.id, { title: '회고' });
    expect(() => store.update(b.id, { end: at(13, 30) })).toThrow(BookingError);
    expect(store.create({ room: 'A', title: '새 회의', start: at(15), end: at(16) }).id).toBe('bk-3');
  });
});
