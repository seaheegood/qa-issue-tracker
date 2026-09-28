/**
 * **DB 에 저장된 색을 글자로 쓸 때** 읽히게 맞춰준다 (`C-51` · 2026-09-11).
 *
 * ★ **왜 필요한가.** 상태·우선순위·팀 색은 사람이 설정 화면에서 고른다.
 *   그 값을 그대로 글자색으로 쓰면 **대비를 아무도 보장하지 않는다** —
 *   실측했더니 상태 배지 `Open` 이 다크에서 **2.09**, 아바타 이니셜이 **2.42** 였다.
 *   토큰(`--text-faint` 등)을 아무리 고쳐도 **여기는 안 바뀐다.**
 *   그런데 하필 이것들이 **하루 종일 읽는 글자**다 (FB-011 4번 재확인).
 *
 * ★ **색은 그대로 두고 밝기만 민다.** 빨강을 회색으로 바꾸면 색으로 구분하던 게
 *   깨진다 — 색상(hue)과 채도는 유지하고 **밝기만** 기준을 넘길 만큼 조정한다.
 *
 * ★ **라이트·다크 두 벌을 만든다.** 서버는 지금 테마를 모른다(테마는 브라우저가 정한다).
 *   그래서 둘 다 계산해 CSS 변수로 넘기고 **CSS 가 고르게** 한다.
 */

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [107, 114, 128];   // 못 읽으면 중간 회색
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");

/** WCAG 상대 휘도. */
export function luminance(hex: string): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** 두 색의 명암비 (1~21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 반투명 색을 배경 위에 **합성**한 결과. 배지의 옅은 배경을 실제 색으로 계산할 때 쓴다. */
export function composite(color: string, alpha: number, bg: string): string {
  const c = parseHex(color), b = parseHex(bg);
  return toHex([0, 1, 2].map((i) => c[i] * alpha + b[i] * (1 - alpha)));
}

/** 이 배경 위에 얹을 글자색 — 흰색과 진한색 중 **더 잘 읽히는 쪽**. */
export function onColor(bg: string): string {
  return contrast("#ffffff", bg) >= contrast("#101a19", bg) ? "#ffffff" : "#101a19";
}

/**
 * `color` 의 **색상은 지키고 밝기만 밀어서** `bg` 위에서 `target` 대비를 넘게 한다.
 *
 * 배경이 밝으면 어둡게, 어두우면 밝게 민다. 한 방향으로 못 맞추면 반대로도 시도한다
 * (아주 진한 배경 위의 아주 진한 색처럼 양쪽 다 애매한 경우가 있다).
 */
export function readableOn(color: string, bg: string, target = 4.5): string {
  if (contrast(color, bg) >= target) return color;
  const rgb = parseHex(color);
  const towardDark = luminance(bg) > 0.18;

  for (const dir of towardDark ? [-1, 1] : [1, -1]) {
    let best: string | null = null;
    // 1% 씩 민다. 100 걸음이면 흰색/검정까지 닿는다.
    for (let step = 1; step <= 100; step++) {
      const t = step / 100;
      const mixed = toHex(rgb.map((v) => (dir < 0 ? v * (1 - t) : v + (255 - v) * t)));
      if (contrast(mixed, bg) >= target) { best = mixed; break; }
    }
    if (best) return best;
  }
  return onColor(bg);
}

/** 화면 바탕 — 라이트/다크에서 글자가 얹히는 기본 배경. `globals.css` 의 `--surface` 와 같다. */
export const SURFACE = { light: "#ffffff", dark: "#141b1a" } as const;

/**
 * 라이트·다크 두 벌을 한 번에. 인라인 스타일에 그대로 펼쳐 넣는다.
 *
 * ```tsx
 * <span className="pri" style={themedText(color)}>{name}</span>
 * ```
 * CSS 쪽은 `color: var(--c-l)` + 다크에서 `color: var(--c-d)`.
 */
export function themedText(color: string, target = 4.5): React.CSSProperties {
  return {
    ["--c-l" as string]: readableOn(color, SURFACE.light, target),
    ["--c-d" as string]: readableOn(color, SURFACE.dark, target),
  } as React.CSSProperties;
}

/**
 * 아바타처럼 **색 위에 글자를 얹는** 자리 — 바탕을 밀어서 대비를 만든다.
 *
 * ★ 글자색을 흰/검정 중에 고르는 것만으로는 모자랐다. 중간 밝기 색은 흰 글자도
 *   검은 글자도 4.5 에 못 닿는다 — 실측 아바타 이니셜이 **2.42** 였다.
 *   그래서 **바탕을 조금 민 뒤** 글자색을 고른다. 색상은 그대로다.
 */
export function chipColors(bg: string, target = 4.5): { bg: string; fg: string } {
  let b = bg;
  for (let i = 0; i < 24; i++) {
    const fg = onColor(b);
    if (contrast(fg, b) >= target) return { bg: b, fg };
    // 흰 글자를 쓸 상황이면 바탕을 어둡게, 아니면 밝게
    const dark = onColor(b) === "#ffffff";
    b = composite(dark ? "#000000" : "#ffffff", 0.06, b);
  }
  return { bg: b, fg: onColor(b) };
}
