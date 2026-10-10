# baton-pilot

[Baton](https://github.com/frameonejay/baton) 실제 연동을 확인하는 파일럿 레포다. 회의실 예약 API 하나만 있다.

```bash
npm ci
npm test
npm run lint
npm start   # http://localhost:3000
```

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/bookings?room=A&limit=20&offset=0` | 예약 목록 `{ items, total, limit, offset }` (시작 시각 순). limit은 1~100(기본 20), offset은 0 이상(기본 0). 범위를 벗어나거나 정수가 아니면 400 |
| POST | `/bookings` | `{ room, title, start, end, attendees?, repeatWeeks? }`. 겹치면 409. attendees(참석 인원)는 1 이상의 정수(아니면 400)이고 주면 예약에 들어간다. 회의실 정원을 넘으면 400(정원을 모르는 회의실이나 attendees가 없으면 확인하지 않는다). repeatWeeks(2~12의 정수, 아니면 400)를 주면 시작·종료를 7일씩 옮겨 그 수만큼 만들고 예약 배열(첫 주부터)을 돌려준다. 한 주라도 안 되면 아무것도 만들지 않는다 |
| PATCH | `/bookings/:id` | `{ title?, start?, end? }` 중 준 것만 바꾸고 200과 바뀐 예약을 돌려준다. 회의실·id는 바뀌지 않는다. 다른 예약과 겹치면 409, 없으면 404, 생성 규칙에 어긋나면 400 |
| DELETE | `/bookings/:id` | 예약 취소. 시작까지 1시간이 안 남았거나 이미 시작했으면 409, 없으면 404 |
| GET | `/rooms?minCapacity=N` | 회의실 목록 `{ items }` (id 순, 각 항목 `{ id, name, capacity }`). minCapacity를 주면 수용 인원이 N 이상인 회의실만. N이 1 이상의 정수가 아니면 400, 맞는 회의실이 없으면 빈 배열 |
| GET | `/rooms/:id` | 회의실 `{ id, name, capacity }`. 없으면 404 |

## 규칙

- 테스트를 먼저 쓰고 구현한다. 커밋은 새 기능이면 `test(KEY): …` 다음에 `feat(KEY): …`, 버그 수정이면 `test(KEY): …` 다음에 `fix(KEY): …`.
- CI 실패나 리뷰 지적을 고치는 후속 커밋도 `fix(KEY): …`로 쓴다.
- 오류 메시지는 한국어로 쓴다.
- `infra/`와 `.github/workflows/`는 사람만 고친다.
