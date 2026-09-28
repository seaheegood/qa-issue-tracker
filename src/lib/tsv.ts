/**
 * 엑셀에서 복사한 클립보드 텍스트를 표로 되돌린다.
 *
 * 엑셀은 셀을 **탭**으로, 행을 **줄바꿈**으로 이어 붙인다.
 * 그런데 셀 안에 줄바꿈·탭·따옴표가 들어 있으면 그 셀을 큰따옴표로 감싸고,
 * 안쪽의 큰따옴표는 두 번(`""`) 적는다.
 *
 *   1. 로그인 진입	"1. 아이디 입력
 *   2. 확인"	기대값
 *
 * 그래서 **탭으로 그냥 자르면 여러 줄짜리 셀이 통째로 깨진다.**
 * 실제 TC 파일에서 Precondition 의 59%, Description 의 46% 가 여러 줄이다.
 * 한 글자씩 읽으면서 따옴표 안에 있는지를 추적해야 한다.
 */
export function parseClipboardTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // 줄 끝 표기를 하나로 맞춘다 (윈도우 \r\n, 옛 맥 \r)
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {   // "" → 따옴표 한 개
          field += '"';
          i++;
        } else {
          inQuotes = false;          // 닫는 따옴표
        }
      } else {
        field += ch;                 // 따옴표 안에서는 탭·줄바꿈도 그냥 글자다
      }
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;               // 셀 맨 앞의 따옴표만 여는 것으로 본다
    } else if (ch === "\t") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // 마지막 셀·행 마무리 (파일 끝에 줄바꿈이 없을 수 있다)
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 엑셀이 붙이는 맨 끝 빈 줄 제거
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}
