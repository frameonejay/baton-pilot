# 변경 기록

## 미배포

- [ELMJ-5] GET /bookings 응답을 `{ items, total, limit, offset }` 페이지 형식으로 바꾼다 (배열 응답은 없앤다)
- [ELMJ-3] 예약 길이를 15분~4시간으로 제한한다 (DURATION_TOO_SHORT·DURATION_TOO_LONG)
- CI: PR마다 CHANGELOG.md 갱신을 확인한다
