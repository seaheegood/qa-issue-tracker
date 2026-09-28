import { deflateRawSync } from "node:zlib";

/**
 * 최소한의 `.xlsx` 쓰기 — **라이브러리 없이**.
 *
 * ★ 왜 직접 쓰나.
 *   이 프로젝트의 런타임 의존성은 7개다. 엑셀 라이브러리(`exceljs` 등)는 그 하나로
 *   1MB 넘게 들어오고 빌드가 느려진다. 우리가 필요한 건 **표 한 장**이다 —
 *   수식도, 차트도, 이미지도 없다.
 *
 * ★ 왜 CSV 로 타협하지 않았나.
 *   요구사항서 09 가 *"현재 시트와 같은 칼럼 구성"* 을 요구한다. 그리고 테스트 경로는
 *   **줄바꿈이 들어 있는 긴 글**이다 — CSV 로 내보내면 엑셀이 행을 쪼개는 사고가 난다.
 *   한글 CSV 는 맥 엑셀에서 인코딩도 자주 깨진다.
 *
 * `.xlsx` 는 사실 **XML 몇 장을 담은 ZIP**이다. 우리가 쓰는 건 그중 다섯 장뿐이다:
 *
 *   [Content_Types].xml        어떤 파일이 들어 있는지
 *   _rels/.rels                시작점이 workbook.xml 이라는 표시
 *   xl/workbook.xml            시트 목록
 *   xl/_rels/workbook.xml.rels 시트 파일이 어디 있는지
 *   xl/worksheets/sheet1.xml   ★ 실제 표
 *   xl/styles.xml              머리글 굵게 · 긴 글 줄바꿈
 *
 * 문자열은 `sharedStrings.xml` 없이 **inline string**(`t="inlineStr"`)으로 넣는다.
 * 파일이 조금 커지는 대신 사전 테이블을 관리할 필요가 없어 틀릴 여지가 줄어든다.
 */

export type Cell = string | number | null | undefined;

/** XML 에서 깨지면 안 되는 다섯 글자. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
   // 엑셀은 XML 1.0 제어문자를 거부한다. 실데이터에 \x0b 같은 게 섞여 들어온 적이 있다.
   .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

/** 0 → A, 25 → Z, 26 → AA. 열 번호를 엑셀 이름으로. */
function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

function cellXml(v: Cell, ref: string, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    return `<c r="${ref}"${s}><v>${v}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

// ── ZIP ────────────────────────────────────────────────────
//
// ZIP 은 [파일 데이터]* + [중앙 디렉터리] + [끝 기록] 이다.
// 각 항목의 CRC32 와 위치를 중앙 디렉터리가 가리킨다.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

type Entry = { name: string; data: Buffer };

function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf-8");
    const comp = deflateRawSync(e.data);   // method 8 (deflate)
    const crc = crc32(e.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);    // 로컬 헤더 서명
    local.writeUInt16LE(20, 4);            // 필요한 버전
    local.writeUInt16LE(0x0800, 6);        // ★ 이름이 UTF-8 이라는 플래그. 없으면 한글 파일명이 깨진다
    local.writeUInt16LE(8, 8);             // 압축 방식
    local.writeUInt16LE(0, 10);            // 시각 — 0 으로 고정한다. 같은 내용이면 같은 파일이 나온다
    local.writeUInt16LE(0x21, 12);         // 날짜 (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);     // 이 항목의 로컬 헤더가 파일 어디에 있나
    name.copy(central, 46);

    locals.push(local, comp);
    centrals.push(central);
    offset += local.length + comp.length;
  }

  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, cd, end]);
}

// ── 시트 ───────────────────────────────────────────────────

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WB_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * 스타일 세 가지만 둔다.
 *   0  기본
 *   1  머리글 — 굵게 + 회색 배경 + 가운데
 *   2  긴 글 — 줄바꿈. 테스트 경로·이슈 내용이 한 줄로 뻗으면 아무도 못 읽는다
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF3F2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export type SheetSpec = {
  name: string;
  /** 열 정의 — 제목, 너비(엑셀 문자 단위), 긴 글인가 */
  columns: { title: string; width: number; wrap?: boolean }[];
  rows: Cell[][];
};

export function buildXlsx(sheet: SheetSpec): Buffer {
  const { columns, rows } = sheet;
  const last = colName(columns.length - 1);

  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join("");

  const header =
    `<row r="1" ht="22" customHeight="1">` +
    columns.map((c, i) => cellXml(c.title, `${colName(i)}1`, 1)).join("") +
    `</row>`;

  const body = rows
    .map((r, ri) => {
      const n = ri + 2;
      const cells = columns
        .map((c, ci) => cellXml(r[ci], `${colName(ci)}${n}`, c.wrap ? 2 : 0))
        .join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");

  // 머리글 고정 + 자동 필터. 1,704행짜리 시트에서 이게 없으면 못 쓴다 —
  // 엑셀에서 K3(자유로운 필터/정렬)로 지켜야 할 강점으로 꼽은 것이다 (docs/01).
  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="A1:${last}${rows.length + 1}"/>` +
    `</worksheet>`;

  const wb =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${esc(sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const b = (s: string) => Buffer.from(s, "utf-8");
  return zip([
    { name: "[Content_Types].xml", data: b(CT) },
    { name: "_rels/.rels", data: b(RELS) },
    { name: "xl/workbook.xml", data: b(wb) },
    { name: "xl/_rels/workbook.xml.rels", data: b(WB_RELS) },
    { name: "xl/styles.xml", data: b(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: b(sheetXml) },
  ]);
}
