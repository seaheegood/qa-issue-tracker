/**
 * 글 길이에 맞춰 `<textarea>` 높이를 맞춘다.
 *
 * ★ **한 곳에서만 만든다.** 예전엔 이슈 수정 화면에만 있었고, 코멘트는
 *   `min-height: 60px` 고정이라 **세 줄만 넘어가도 칸 안에서 스크롤**해야 했다
 *   (`docs/피드백` FB-011 2번 — *"코멘트 입력란 사이즈 이슈"*).
 *   베껴 쓰면 두 화면이 서로 다르게 자라기 시작한다.
 *
 * ⚠️ **먼저 `auto` 로 줄여야** `scrollHeight` 가 '지금 글' 기준이 된다.
 *   안 줄이면 한 번 커진 칸은 글을 지워도 영영 안 줄어든다.
 *
 * ⚠️ `scrollHeight` 는 **테두리를 안 센다.** `box-sizing: border-box` 라 그만큼 더한다.
 */
export function autosize(el: HTMLTextAreaElement | null, opts: { keep?: boolean } = {}) {
  if (!el) return;
  const had = el.offsetHeight;
  el.style.height = "auto";
  const want = el.scrollHeight + (el.offsetHeight - el.clientHeight);

  if (opts.keep) {
    // 타이핑 중에는 **키우기만** 한다 — 모서리를 끌어 키워 놓은 것을 되돌리면 안 된다
    el.style.height = `${Math.max(want, had)}px`;
    return;
  }
  // 상한은 화면의 **0.7** — *"한번더 사이즈 조절해서 확인하는 일이 생기니까 귀찮다"*.
  // 상한에 걸리면 칸 안에서 스크롤해야 하는데, 그게 바로 없애려는 그 번거로움이다.
  // 그렇다고 아예 안 막으면 아주 긴 글 하나가 화면을 통째로 먹는다.
  el.style.height = `${Math.min(want, Math.round(window.innerHeight * 0.7))}px`;
}
