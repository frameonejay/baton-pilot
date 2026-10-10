# 변경 기록

## 미배포

- [ELMJ-6] 시작까지 1시간이 안 남았거나 이미 시작한 예약의 취소를 409로 막는다
- [ELMJ-5] GET /bookings 응답을 { items, total, limit, offset } 페이지 형식으로 바꾼다 (배열 응답 폐지) [ci-feedback-7q2]
- [ELMJ-4] 한국 시간 09:00~18:00 업무 시간 밖의 예약을 막는다 (OUTSIDE_BUSINESS_HOURS) [ci-feedback-7q2]
- CI: CHANGELOG 줄에 릴리스 태그를 확인한다 [ci-feedback-7q2]
- [ELMJ-3] 예약 길이를 15분~4시간으로 제한한다 (DURATION_TOO_SHORT·DURATION_TOO_LONG)
- CI: PR마다 CHANGELOG.md 갱신을 확인한다
