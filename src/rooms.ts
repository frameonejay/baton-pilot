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
}
