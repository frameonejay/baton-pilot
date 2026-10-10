/** 회의실. 예약의 room은 회의실 id를 가리킨다. */
export interface Room {
  id: string;
  name: string;
  capacity: number;
}

export const DEFAULT_ROOMS: readonly Room[] = [
  { id: 'A', name: '회의실 A', capacity: 6 },
  { id: 'B', name: '회의실 B', capacity: 10 },
];

export class RoomStore {
  private readonly rooms: Map<string, Room>;

  constructor(rooms: readonly Room[] = DEFAULT_ROOMS) {
    this.rooms = new Map(rooms.map((r) => [r.id, { ...r }]));
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  /** id 순 목록. minCapacity를 주면 수용 인원이 그 이상인 회의실만 */
  list(minCapacity = 0): Room[] {
    return [...this.rooms.values()]
      .filter((r) => r.capacity >= minCapacity)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }));
  }
}
