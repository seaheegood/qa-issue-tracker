import { inflateRawSync } from "node:zlib";

/**
 * 최소한의 `.xlsx` 읽기 — **라이브러리 없이**.
 *
 * ★ 왜 직접 읽나.
 *   `xlsx.ts` 가 쓰기를 직접 짠 이유와 같다 — 런타임 의존성 7개를 지키기 위해서다.
 *   그리고 읽기는 쓰기의 **정확한 역함수**다: `deflateRawSync` ↔ `inflateRawSync`,
 *   `colName()` ↔ `colIndex()`. 같은 파일 형식을 반대로 오갈 뿐이다.
 *
 * ⚠️ **다만 읽기는 쓰기보다 어렵다.** 쓰기는 우리가 뭘 쓸지 정하지만,
 *   읽기는 **남이 만든 파일**이 들어온다. 그래서 여기서는 실파일 4장을 놓고 맞췄다:
 *
 *     샘플_이슈리스트.xlsx        압축 method 8·0 혼재 · sharedStrings 1.1MB
 *     샘플_Testcase.xlsx      시트 17 · sharedStrings 2.6MB
 *     IA&기능정의 통합.xlsx           시트 6
 *     고객사 이슈리스트.xlsx          시트 4 · 이미지 51 · 스레드 코멘트 · 선행 빈 열
 *
 *   `scripts/xlsx_read_probe.ts` 가 이 넷을 openpyxl 결과와 셀 단위로 대조한다.
 *   **그 대조가 이 파일을 믿을 유일한 근거다.**
 *
 * ★ 안 하는 것: 차트 · 이미지 · 조건부서식 · ZIP64 · 암호화 · 구형 `.xls`.
 *   병합셀은 좌상단 값만, 수식은 **캐시값**만 읽는다.
 *
 *   ⚠️ 특히 **셀 위에 떠 있는 이미지는 가져올 수 없다.** 실제 고객사 파일의
 *     `관련이미지` 열이 그렇다 — 값이 0건이고 이미지 51장이 전부 drawing 이다.
 *     엑셀에서 이미지는 셀의 값이 아니라 시트 위에 얹힌 도형이라서,
 *     "몇 번 행의 이미지"라는 정보가 파일 안에 확실하게 없다.
 */

// ── ZIP 풀기 ────────────────────────────────────────────────
//
// ZIP 은 [파일 데이터]* + [중앙 디렉터리] + [끝 기록(EOCD)] 이다.
// 끝에서부터 EOCD 를 찾고, 거기가 가리키는 중앙 디렉터리로 항목 목록을 얻는다.
//
// ★ **필요한 항목만 그때 푼다.** 고객사 파일은 82개 항목 중 51개가 PNG 다.
//   전부 풀면 쓰지도 않을 이미지를 메모리에 올리게 된다.

type ZipEntry = { method: number; localOffset: number; compSize: number; size: number };

/**
 * XML 1.0 의 **줄바꿈 정규화**.
 *
 * ★ 규격이 정한 파서의 의무다 — 문서 안의 `\r\n` 과 홑 `\r` 은 `\n` 하나로 바꿔 읽어야 한다.
 *   진짜 CR 을 남기려면 파일이 `&#13;` 으로 이스케이프해서 넣고, 그건 `unesc()` 가 되살린다.
 *
 * ⚠️ **이걸 빼면 조용히 틀린다.** 정규식으로 XML 을 훑으면 파서가 해 주던 이 일이 빠진다.
 *   실제로 고객사 파일의 여러 줄 코멘트에서 우리만 `\r\n` 을 들고 있어
 *   openpyxl 대조에서 10건이 어긋났다. 화면에선 티가 안 나고,
 *   나중에 검색·비교할 때 같은 글자가 서로 다른 값이 된다.
 */
function normalizeEol(s: string): string {
  return s.includes("\r") ? s.replace(/\r\n?/g, "\n") : s;
}

class Zip {
  private buf: Buffer;
  private entries = new Map<string, ZipEntry>();

  constructor(buf: Buffer) {
    this.buf = buf;
    this.readCentralDirectory();
  }

  private readCentralDirectory() {
    const b = this.buf;

    // EOCD 서명을 뒤에서부터 찾는다. 주석이 최대 65535 바이트라 그만큼만 거슬러 간다.
    let eocd = -1;
    const from = Math.max(0, b.length - 65557);
    for (let i = b.length - 22; i >= from; i--) {
      if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new XlsxError("엑셀 파일이 아니거나 파일이 손상됐습니다.");

    const count = b.readUInt16LE(eocd + 10);
    let off = b.readUInt32LE(eocd + 16);
    if (off === 0xffffffff || count === 0xffff) {
      // ZIP64. 4GB 넘거나 항목 65535개 초과일 때만 나온다 — 엑셀 시트로는 사실상 안 나온다.
      throw new XlsxError("ZIP64 형식의 파일은 읽을 수 없습니다.");
    }

    for (let i = 0; i < count; i++) {
      if (b.readUInt32LE(off) !== 0x02014b50) break;
      const method = b.readUInt16LE(off + 10);
      const compSize = b.readUInt32LE(off + 20);
      const size = b.readUInt32LE(off + 24);
      const nameLen = b.readUInt16LE(off + 28);
      const extraLen = b.readUInt16LE(off + 30);
      const commentLen = b.readUInt16LE(off + 32);
      const localOffset = b.readUInt32LE(off + 42);
      const name = b.toString("utf-8", off + 46, off + 46 + nameLen);
      this.entries.set(name, { method, localOffset, compSize, size });
      off += 46 + nameLen + extraLen + commentLen;
    }
  }

  has(name: string) { return this.entries.has(name); }

  /** 항목 하나를 풀어 문자열로. 없으면 `null`. */
  text(name: string): string | null {
    const e = this.entries.get(name);
    if (!e) return null;
    const b = this.buf;

    // ★ 로컬 헤더의 이름·추가필드 길이는 **중앙 디렉터리와 다를 수 있다.**
    //   그래서 데이터 시작점은 반드시 로컬 헤더에서 다시 읽는다.
    if (b.readUInt32LE(e.localOffset) !== 0x04034b50) {
      throw new XlsxError("파일 구조가 깨져 있습니다.");
    }
    const nameLen = b.readUInt16LE(e.localOffset + 26);
    const extraLen = b.readUInt16LE(e.localOffset + 28);
    const start = e.localOffset + 30 + nameLen + extraLen;
    const raw = b.subarray(start, start + e.compSize);

    if (e.method === 0) return normalizeEol(raw.toString("utf-8"));        // 무압축
    if (e.method === 8) return normalizeEol(inflateRawSync(raw).toString("utf-8"));
    throw new XlsxError(`지원하지 않는 압축 방식입니다 (method ${e.method}).`);
  }
}

/** 사용자에게 그대로 보여줄 수 있는 오류. "왜 안 되는지"를 말한다. */
export class XlsxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxError";
  }
}

// ── XML 조각 다루기 ─────────────────────────────────────────
//
// DOM 파서를 붙이지 않는다. 우리가 보는 XML 은 스프레드시트 세 종류뿐이고
// 구조가 단순해서, 필요한 태그만 정규식으로 훑는 편이 빠르고 의존성도 안 는다.

const ENTITY: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

function unesc(s: string): string {
  if (!s.includes("&")) return s;   // 대부분의 셀은 여기서 끝난다
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X"
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITY[ent] ?? m;
  });
}

/** `<a ... attr="값" ...>` 에서 attr 을 꺼낸다. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unesc(m[1]) : null;
}

/** `A` → 0, `Z` → 25, `AA` → 26. `xlsx.ts` 의 `colName()` 역함수. */
export function colIndex(name: string): number {
  let n = 0;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 65 || c > 90) break;   // `B12` 처럼 행 번호가 붙어 오면 거기서 멈춘다
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

// ── sharedStrings ───────────────────────────────────────────

/**
 * 문자열 사전. 셀이 `t="s"` 면 값이 글자가 아니라 **이 표의 번호**다.
 *
 * ★ `<si>` 하나가 `<t>` 하나라는 보장이 없다. 셀 안에서 글자 일부만 굵게 하면
 *   `<r>` 런으로 쪼개져 `<t>` 가 여러 개가 된다. **전부 이어붙여야** 원문이 된다.
 *
 * ★ `<rPh>`(일본어 후리가나)는 빼야 한다. 그 안에도 `<t>` 가 있어서
 *   같이 붙이면 없던 글자가 셀에 생긴다.
 */
function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const si = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = si.exec(xml))) {
    const inner = m[1];
    if (inner === undefined) { out.push(""); continue; }   // `<si/>` — 빈 문자열
    const body = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    let s = "";
    const t = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
    let tm: RegExpExecArray | null;
    while ((tm = t.exec(body))) s += tm[1] === undefined ? "" : unesc(tm[1]);
    out.push(s);
  }
  return out;
}

// ── 날짜 서식 ───────────────────────────────────────────────
//
// 엑셀에서 날짜는 **숫자**다. 2026-08-18 은 파일 안에 46252 로 들어 있다.
// 날짜인지 아닌지는 값이 아니라 **셀에 걸린 서식**이 정한다. 그래서 styles.xml 을 본다.

/** 엑셀 내장 서식 중 날짜·시간인 번호. */
const BUILTIN_DATE = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,          // 날짜 · 시각
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,      // 동아시아 날짜
  45, 46, 47,                                   // mm:ss · [h]:mm:ss
  50, 51, 52, 53, 54, 55, 56, 57, 58,          // 동아시아 날짜 (계속)
]);

/** 시각만 있고 날짜가 없는 서식. `18:00` 을 `1899-12-30 18:00` 으로 보이면 안 된다. */
const BUILTIN_TIME_ONLY = new Set([18, 19, 20, 21, 45, 46, 47]);

type Styles = {
  /** cellXfs 순서대로의 numFmtId. 셀의 `s` 속성이 이 배열의 첨자다. */
  xfFmt: number[];
  /** 커스텀 서식 번호 → 날짜인가 */
  customDate: Map<number, boolean>;
  customTimeOnly: Map<number, boolean>;
};

/** 서식 문자열이 날짜/시각을 그리는가. 따옴표 안 글자와 `[빨강]` 같은 지시자는 뺀다. */
function looksLikeDate(code: string): boolean {
  const bare = code
    .replace(/"[^"]*"/g, "")      // "년" 같은 리터럴
    .replace(/\[[^\]]*\]/g, "")   // [$-409] · [빨강] — 단 [h] 는 아래에서 따로 본다
    .replace(/\\./g, "");         // \- 이스케이프
  return /[ymdhs]/i.test(bare) || /\[h+\]/i.test(code);
}

function looksTimeOnly(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  // y·d 가 없고 h 나 s 만 있으면 시각이다. (m 은 '월'과 '분'을 겸해서 혼자로는 판단 못 한다)
  return !/[yd]/i.test(bare) && /[hs]/i.test(bare);
}

function parseStyles(xml: string | null): Styles {
  const xfFmt: number[] = [];
  const customDate = new Map<number, boolean>();
  const customTimeOnly = new Map<number, boolean>();
  if (!xml) return { xfFmt, customDate, customTimeOnly };

  for (const m of xml.matchAll(/<numFmt\b[^>]*?(?:\/>|>[\s\S]*?<\/numFmt>)/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode") ?? "";
    if (!Number.isFinite(id)) continue;
    customDate.set(id, looksLikeDate(code));
    customTimeOnly.set(id, looksTimeOnly(code));
  }

  // ★ `<xf>` 는 `<cellStyleXfs>` 에도 있고 `<cellXfs>` 에도 있다. 그리고
  //   cellStyleXfs 가 **먼저 나온다.** 통째로 훑으면 첨자가 통째로 밀린다.
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (block) {
    for (const m of block[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)) {
      xfFmt.push(Number(attr(m[0], "numFmtId") ?? 0) || 0);
    }
  }
  return { xfFmt, customDate, customTimeOnly };
}

function isDateStyle(st: Styles, s: number | null): { date: boolean; timeOnly: boolean } {
  if (s === null) return { date: false, timeOnly: false };
  const fmt = st.xfFmt[s];
  if (fmt === undefined) return { date: false, timeOnly: false };
  if (st.customDate.has(fmt)) {
    return { date: st.customDate.get(fmt)!, timeOnly: st.customTimeOnly.get(fmt) ?? false };
  }
  return { date: BUILTIN_DATE.has(fmt), timeOnly: BUILTIN_TIME_ONLY.has(fmt) };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * 엑셀 일련번호 → 사람이 읽는 글자.
 *
 * ★ 기준일이 **1899-12-30** 이다. 1900-01-01 이 아니다.
 *   엑셀이 1900년을 윤년으로 잘못 알고 있어서(존재하지 않는 2월 29일을 센다)
 *   기준을 하루 당겨 두면 1900-03-01 이후가 전부 맞아떨어진다.
 *
 * ★ 시각이 00:00:00 이면 **날짜만** 낸다. `2026-08-18 00:00:00` 은 사람이 쓴 값이 아니라
 *   엑셀이 날짜를 그렇게 저장했을 뿐이다. 그대로 보이면 표가 지저분해진다.
 */
function serialToText(serial: number, timeOnly: boolean): string {
  const ms = Math.round(serial * 86400000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  if (Number.isNaN(d.getTime())) return String(serial);

  const hh = d.getUTCHours(), mi = d.getUTCMinutes(), ss = d.getUTCSeconds();
  const time = `${p2(hh)}:${p2(mi)}:${p2(ss)}`;
  if (timeOnly) return time;

  const date = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  return hh || mi || ss ? `${date} ${time}` : date;
}

/**
 * 숫자를 글자로. `0.1 + 0.2` 류의 부동소수점 찌꺼기를 만들지 않는다.
 * 엑셀이 파일에 `1.3000000000000001` 로 적어 두는 경우가 실제로 있다.
 */
function numberToText(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const r = Number(n.toPrecision(15));
  return String(r);
}

// ── 시트 읽기 ───────────────────────────────────────────────

export type SheetInfo = {
  /** 엑셀 탭에 보이는 이름 */
  name: string;
  /** ZIP 안의 경로. 내부용 */
  path: string;
  /** 숨겨진 시트인가 */
  hidden: boolean;
};

export type Grid = {
  sheetName: string;
  /**
   * 행 × 열. **원본 좌표를 그대로 지킨다** — `rows[0][1]` 은 언제나 엑셀의 `B1` 이다.
   * 앞이 비어 있다고 당기지 않는다. 당기면 화면에서 고른 열과 파일의 열이 어긋난다.
   */
  rows: string[][];
  /** 실제로 값이 있었던 마지막 열 + 1 */
  colCount: number;
  /** 꼬리의 빈 행을 잘라낸 뒤의 행 수 */
  rowCount: number;
  /** 행 상한에 걸려 잘렸는가 */
  truncated: boolean;
};

export const MAX_ROWS = 20000;

export class Workbook {
  private zip: Zip;
  private shared: string[];
  private styles: Styles;
  readonly sheets: SheetInfo[];

  constructor(buf: Buffer) {
    this.zip = new Zip(buf);
    if (!this.zip.has("xl/workbook.xml")) {
      // `.xls`(구형 이진) 나 암호로 잠긴 파일이 여기로 온다. 둘 다 ZIP 이 아니거나
      // 안에 workbook.xml 이 없다. 무엇이 문제인지 말해 준다 — 빈 표를 내놓지 않는다.
      throw new XlsxError(
        "읽을 수 없는 파일입니다. 암호가 걸려 있거나, 구형 .xls 형식일 수 있습니다. " +
        "엑셀에서 '다른 이름으로 저장 → .xlsx' 로 바꾼 뒤 다시 올려 주세요.",
      );
    }
    this.shared = parseSharedStrings(this.zip.text("xl/sharedStrings.xml"));
    this.styles = parseStyles(this.zip.text("xl/styles.xml"));
    this.sheets = this.readSheetList();
  }

  /**
   * 시트 목록.
   *
   * ★ **`sheet1.xml` 이 첫 시트라는 보장이 없다.** workbook.xml 의 `r:id` 를
   *   `workbook.xml.rels` 로 한 번 더 풀어야 실제 파일이 나온다. 실파일에서
   *   순서가 어긋난 걸 본 적이 있어서 지름길을 쓰지 않는다.
   */
  private readSheetList(): SheetInfo[] {
    const wb = this.zip.text("xl/workbook.xml") ?? "";
    const rels = this.zip.text("xl/_rels/workbook.xml.rels") ?? "";

    const target = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*?(?:\/>|>[\s\S]*?<\/Relationship>)/g)) {
      const id = attr(m[0], "Id");
      const t = attr(m[0], "Target");
      if (!id || !t) continue;
      // Target 은 `worksheets/sheet1.xml` 처럼 xl/ 기준 상대경로다.
      target.set(id, t.replace(/^\/?xl\//, "").replace(/^\//, ""));
    }

    const out: SheetInfo[] = [];
    for (const m of wb.matchAll(/<sheet\b[^>]*?(?:\/>|>[\s\S]*?<\/sheet>)/g)) {
      const name = attr(m[0], "name");
      const rid = attr(m[0], "r:id") ?? attr(m[0], "id");
      if (!name || !rid) continue;
      const rel = target.get(rid);
      if (!rel) continue;
      out.push({
        name,
        path: `xl/${rel}`,
        hidden: (attr(m[0], "state") ?? "visible") !== "visible",
      });
    }
    return out;
  }

  /** 시트 하나를 표로. 없는 시트면 `XlsxError`. */
  readSheet(sheetName: string): Grid {
    const info = this.sheets.find((s) => s.name === sheetName);
    if (!info) throw new XlsxError(`'${sheetName}' 시트를 찾을 수 없습니다.`);

    const xml = this.zip.text(info.path);
    if (xml === null) throw new XlsxError(`'${sheetName}' 시트를 읽을 수 없습니다.`);

    const rows: string[][] = [];
    let colCount = 0;
    let truncated = false;

    // `<row r="3">…</row>`. 자기닫힘 `<row r="5"/>` 는 빈 행이라 건너뛴다.
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(xml))) {
      const r = Number(attr(`<row${rm[1]}>`, "r"));
      if (!Number.isFinite(r) || r < 1) continue;
      if (r > MAX_ROWS) { truncated = true; break; }

      const cells: string[] = [];
      // `<c r="B3" s="12" t="s"><v>123</v></c>` 또는 자기닫힘 `<c r="A3" s="5"/>`
      const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm: RegExpExecArray | null;
      let auto = 0;   // r 속성이 없는 셀을 위한 자리 세기 (드물지만 규격상 생략 가능)
      while ((cm = cRe.exec(rm[2]))) {
        const tag = `<c${cm[1]}>`;
        const body = cm[2] ?? "";
        const ref = attr(tag, "r");
        const ci = ref ? colIndex(ref) : auto;
        auto = ci + 1;
        if (ci < 0) continue;

        const v = this.cellText(tag, body);
        if (v !== "") {
          while (cells.length < ci) cells.push("");
          cells[ci] = v;
        }
      }

      while (rows.length < r - 1) rows.push([]);
      rows[r - 1] = cells;
      if (cells.length > colCount) colCount = cells.length;
    }

    // ★ 꼬리의 빈 행을 잘라낸다. 고객사 파일은 `max_row` 가 1006 인데 실 데이터는 241행이다.
    //   서식만 걸어 둔 빈 행이 765개 딸려 오는데, 그걸 표에 그리면 화면이 죽는다.
    let last = rows.length;
    while (last > 0 && rows[last - 1].every((c) => c === "")) last--;
    rows.length = last;

    return { sheetName, rows, colCount, rowCount: last, truncated };
  }

  /** 셀 하나의 값을 글자로. */
  private cellText(tag: string, body: string): string {
    const t = attr(tag, "t") ?? "n";
    const sAttr = attr(tag, "s");
    const s = sAttr === null ? null : Number(sAttr);

    if (t === "inlineStr") {
      // `<is>` 안도 sharedStrings 와 같은 구조다 — 런으로 쪼개져 있을 수 있다.
      let out = "";
      const stripped = body.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
      for (const m of stripped.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) {
        out += m[1] === undefined ? "" : unesc(m[1]);
      }
      return out;
    }

    // `<v>` 가 값. 수식(`<f>`)은 무시하고 캐시된 결과만 쓴다.
    const vm = /<v\b[^>]*?(?:\/>|>([\s\S]*?)<\/v>)/.exec(body);
    if (!vm) return "";
    const raw = vm[1] === undefined ? "" : unesc(vm[1]);

    // ★ **캐시값이 비어 있으면 빈칸이다. `0` 이 아니다** (2026-09-11).
    //   `Number("")` 는 `0` 이라, `<v></v>` 가 그대로 **`0` 이라는 그럴듯한 틀린 숫자**가 됐다.
    //   엑셀이 저장한 파일은 늘 캐시값을 갖고 있지만, **도구가 만든 파일은 비어 있다**
    //   (openpyxl·일부 내보내기). 고객사가 그런 파일을 주면 합계 열이 통째로 0 이 되고,
    //   **비어 있다는 사실보다 0 이 더 나쁘다** — 사람이 그 값을 믿는다.
    if (raw === "") return "";

    if (t === "s") {
      const i = Number(raw);
      return this.shared[i] ?? "";
    }
    if (t === "str") return raw;               // 수식의 문자열 결과
    if (t === "e") return raw;                 // #N/A · #REF! — 원문 그대로 보여준다
    if (t === "b") return raw === "1" ? "TRUE" : "FALSE";

    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;

    const { date, timeOnly } = isDateStyle(this.styles, s);
    return date ? serialToText(n, timeOnly) : numberToText(n);
  }
}

/**
 * 파일 바이트로 통합문서를 연다.
 *
 * ZIP·사전·서식을 한 번만 읽어 두고, 시트는 고른 것만 그때 푼다.
 * 업로드 마법사가 "시트 고르기 → 미리보기 → 저장" 세 번을 도는 동안
 * 같은 `Workbook` 을 다시 열지 않게 하려는 것이다.
 */
export function openXlsx(buf: Buffer): Workbook {
  return new Workbook(buf);
}

// ── 표를 다듬는 도우미 ──────────────────────────────────────
//
// 아래 둘은 리더가 아니라 **업로드 화면**이 쓴다.
// 리더는 파일에 있는 그대로만 내놓고, "무엇을 보여줄까"는 화면이 정한다.

/**
 * 통째로 비어 있는 열의 번호.
 *
 * ★ **지우지 않는다. 기본 체크만 꺼 준다.** 고객사 파일은 35열 중 A 와 R~AI 가
 *   전부 비어 있는데(실제 16열), 그렇다고 열을 당겨 버리면 원본 좌표가 틀어진다.
 *   원본 좌표는 `imported_rows.cells` 의 키라서 영원히 안 변해야 한다.
 */
export function emptyColumns(grid: Grid): Set<number> {
  const empty = new Set<number>();
  for (let c = 0; c < grid.colCount; c++) {
    if (grid.rows.every((r) => (r[c] ?? "") === "")) empty.add(c);
  }
  return empty;
}

/**
 * 헤더로 삼을 만한 행을 추측한다 (1-based). 화면의 **기본값**일 뿐, 사람이 고칠 수 있다.
 *
 * ★ 1행이라고 박지 않는다. 실파일에서 헤더가 1행인 시트가 오히려 소수였다 —
 *   고객사 파일의 `Summary` 는 3행, IA 통합은 3행, TC 시트들은 제목·담당자 블록이
 *   위에 얹혀 있어 더 아래다.
 *
 * ★ **"가장 많이 찬 행" 이 아니라 "충분히 찬 첫 행".**
 *   처음엔 최다 행을 골랐다가 IA 통합에서 19행(긴 데이터 행)이 뽑혔다.
 *   헤더보다 칸이 많은 데이터 행은 얼마든지 있다. 헤더의 특징은 **최다**가 아니라
 *   *"위에서 처음으로 표다워지는 줄"* 이다.
 */
export function guessHeaderRow(grid: Grid): number {
  const limit = Math.min(grid.rows.length, 30);
  if (limit === 0) return 1;

  const counts: number[] = [];
  for (let i = 0; i < limit; i++) counts.push(grid.rows[i].filter((c) => c !== "").length);

  const peak = Math.max(...counts);
  if (peak === 0) return 1;

  // 최다 행의 60% 만 차 있어도 표의 머리로 본다. 제목 한 칸짜리 줄은 이 문턱을 못 넘는다.
  const need = Math.max(2, Math.ceil(peak * 0.6));
  const i = counts.findIndex((n) => n >= need);
  return i < 0 ? 1 : i + 1;
}
