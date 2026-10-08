import { BookingError } from './bookings.ts';

/** 회의실. 예약의 room은 회의실 id다. */
export interface Room {
  id: string;
  name: string;
  capacity: number;
}

/** 서버를 띄울 때 쓰는 기본 회의실 목록 */
export const DEFAULT_ROOMS: Room[] = [
  { id: 'A', name: '회의실 A', capacity: 6 },
  { id: 'B', name: '회의실 B', capacity: 10 },
];

export class RoomStore {
  private readonly rooms: Map<string, Room>;

  constructor(rooms: Room[] = DEFAULT_ROOMS) {
    this.rooms = new Map(rooms.map((r) => [r.id, r]));
  }

  get(id: string): Room {
    const found = this.rooms.get(id);
    if (!found) throw new BookingError(404, `회의실 ${id}가 없습니다`);
    return found;
  }
}
