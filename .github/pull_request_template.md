## 무엇을 바꿨나


## 확인 (AGENTS.md 「6. 올리기 전 확인」)
- [ ] `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run` 통과
- [ ] `npx tsx scripts/layout-check.ts` 결과: 문제 __개 (새로 생긴 문제 없음)
- [ ] 화면 흐름·문구를 바꿨다면 `npx tsx scripts/e2e.ts` 결과: __/__
- [ ] 휴대전화·노트북·(해당되면) 키오스크 화면 그림 첨부
- [ ] 글자 「아주 크게」(1.5배)에서도 잘리거나 겹치지 않음
- [ ] `layout.tsx` 끝에 덮어쓰는 새 CSS 파일을 더하지 않음, 색은 토큰만 사용
- [ ] DB 구조 변경 없음 (있으면 적기)
- [ ] 외부 자료를 가져왔다면 출처·이용 조건 적기
