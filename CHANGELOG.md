# 변경 기록

## 미배포

- [ELMJ-11] README 커밋 규칙에 버그 수정과 CI·리뷰 후속 수정용 fix(KEY)를 적는다
- [ELMJ-10] PATCH /bookings/:id로 예약의 제목·시간을 바꾼다 (회의실은 그대로, 실패하면 바뀌지 않는다) [ci-feedback-7q2]
- [ELMJ-9] GET /bookings 목록을 오프셋과 상관없이 실제 시작 시각 순으로, 같으면 먼저 만든 예약 순으로 정렬한다 [ci-feedback-7q2]
- [ELMJ-7] POST /bookings에 repeatWeeks(2~12)를 주면 같은 요일·시각으로 여러 주를 한 번에 예약한다 (하나라도 안 되면 아무것도 만들지 않는다) [ci-feedback-7q2]
- [ELMJ-6] 시작까지 1시간이 안 남았거나 이미 시작한 예약의 취소를 409로 막는다 [ci-feedback-7q2]
- [ELMJ-5] GET /bookings 응답을 { items, total, limit, offset } 페이지 형식으로 바꾼다 (배열 응답 폐지) [ci-feedback-7q2]
- [ELMJ-4] 한국 시간 09:00~18:00 업무 시간 밖의 예약을 막는다 (OUTSIDE_BUSINESS_HOURS) [ci-feedback-7q2]
- CI: CHANGELOG 줄에 릴리스 태그를 확인한다 [ci-feedback-7q2]
- [ELMJ-3] 예약 길이를 15분~4시간으로 제한한다 (DURATION_TOO_SHORT·DURATION_TOO_LONG)
- CI: PR마다 CHANGELOG.md 갱신을 확인한다
