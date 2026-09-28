import { Avatar, formatDateTime } from "@/lib/ui";

export type HistoryRow = {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  changedAt: Date;
  changedByRole: string | null;
  changedBy: { name: string; team: { name: string; color: string } | null };
};

/** DB 에는 영문 키만 저장하고, 사람이 읽을 이름은 여기서 붙인다. */
const FIELD_LABEL: Record<string, string> = {
  status: "상태",
  assignee: "담당자",
  priority: "우선순위",
  environment: "환경",
  system: "시스템",
  screen: "화면",
  external_ref: "QAI #",
  title: "이슈타이틀",
  content: "이슈 내용",
  test_path: "테스트 경로",
  expected: "테스트 기대값",
  attachment: "첨부",
  round: "차수",
  repro: "재현율",
  platform: "플랫폼",
  found_version: "검출 버전",
  fixed_version: "반영 버전",
  relation: "관련 이슈",
  // ★ 보낸 것과 손으로 적어 둔 것이 **같은 칸**이다 (2026-09-21 · `J-23`)
  jira: "지라 티켓",
  // ★ 코멘트도 **이슈에 일어난 일**이다 (2026-09-17). 별도 표가 아니라 여기 섞어
  //   시간순 한 줄기로 읽는다 — 상태가 바뀐 것과 말이 오간 것이 같은 이야기다.
  comment: "코멘트",
  comment_deleted: "코멘트 삭제",
  deleted: "이슈 숨김",
  restored: "이슈 되살림",
};

/** 전문이 들어오는 칸 — 한 줄로 못 보여 주므로 접어서 그린다 */
const LONG_FIELDS = new Set([
  "content", "test_path", "expected", "comment", "comment_deleted",
]);

/**
 * 변경 이력. append-only 라 수정·삭제 기능은 없다.
 *
 * 이 목록이 쌓여야 "처리에 며칠 걸렸나"와 "재수정이 몇 번 났나"를 계산할 수 있고,
 * 그게 대시보드에서 임원이 가장 궁금해하는 두 지표다 (docs/10).
 */
export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="prose none">
        아직 변경 이력이 없습니다. 상태나 담당자를 바꾸면 여기에 쌓입니다.
        <br />
        엑셀에는 이 기록이 없어서 처리 소요일과 재수정률을 계산할 수 없었습니다.
      </div>
    );
  }

  return (
    <ul className="hist">
      {rows.map((h) => (
        <li key={h.id}>
          <Avatar name={h.changedBy.name} color={h.changedBy.team?.color} size={20} />
          <div className="hbody">
            <div className="hline">
              <b>{h.changedBy.name}</b>
              {h.changedBy.team && <span className="team-tag">{h.changedBy.team.name}</span>}
              <span className="hfield">{FIELD_LABEL[h.field] ?? h.field}</span>
              {/* ★★ **긴 글은 접어서 그린다** (2026-09-17).
                  전문을 남기기로 하면서 본문·코멘트가 통째로 들어온다 — 한 줄에
                  펼치면 이력 하나가 화면을 다 먹는다. 눌러야 펼쳐진다.
                  ⚠️ 옛 행은 전·후가 **둘 다 비어 있다** (그때는 안 남겼다).
                    그 경우에만 `수정함` 한 단어로 그린다. */}
              {h.oldValue === null && h.newValue === null ? (
                <span className="hchange"><span className="hnew">수정함</span></span>
              ) : LONG_FIELDS.has(h.field) ? (
                <details className="hlong">
                  <summary>
                    {h.newValue === null ? "지운 글 보기"
                      : h.oldValue === null ? "쓴 글 보기" : "바뀐 글 보기"}
                  </summary>
                  <div className="hlong-body">
                    {h.oldValue !== null && (
                      <div className="hlong-side">
                        <span className="hlong-k">전</span>
                        <pre>{h.oldValue}</pre>
                      </div>
                    )}
                    {h.newValue !== null && (
                      <div className="hlong-side">
                        <span className="hlong-k">후</span>
                        <pre>{h.newValue}</pre>
                      </div>
                    )}
                  </div>
                </details>
              ) : (
                <span className="hchange">
                  <span className="hold">{h.oldValue ?? "—"}</span>
                  <span className="harrow">→</span>
                  <span className="hnew">{h.newValue ?? "—"}</span>
                </span>
              )}
              <span className="htime">{formatDateTime(h.changedAt)}</span>
            </div>
            {h.note && <div className="hnote">{h.note}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
