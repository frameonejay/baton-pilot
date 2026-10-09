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
| GET | `/bookings?room=A` | 예약 목록 (시작 시각 순) |
| POST | `/bookings` | `{ room, title, start, end }`. 겹치면 409. `repeatWeeks`(2~12)를 주면 7일씩 옮겨 그만큼 만들고 배열로 돌려준다. 한 주라도 안 되면 아무것도 만들지 않는다 |
| DELETE | `/bookings/:id` | 예약 취소. 없으면 404 |
| GET | `/rooms/:id` | 회의실 `{ id, name, capacity }`. 없으면 404 |

## 규칙

- 테스트를 먼저 쓰고 구현한다. 커밋은 `test(KEY): …` 다음에 `feat(KEY): …`.
- 오류 메시지는 한국어로 쓴다.
- `infra/`와 `.github/workflows/`는 사람만 고친다.
