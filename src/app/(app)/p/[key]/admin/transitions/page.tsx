import { ProjectField } from "@/components/ProjectField";

import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";
import { StatusDot } from "@/lib/ui";

import { setTransitionReason, toggleTransition } from "../actions";
import { notDeleted } from "@/lib/issue-filter";

export const metadata = { title: "전이 규칙 · IssueTracker" };


/**
 * 상태 전이 규칙 매트릭스 (docs/03 3.2 · docs/13 D-01).
 *
 * 세로가 '지금 상태', 가로가 '갈 수 있는 곳'이다.
 * 체크를 끄면 그 길이 막히고, 이슈 화면의 드롭다운에서 즉시 사라진다.
 *
 * 이 화면을 만든 이유는 규칙이 DB 에만 있으면 아무도 못 보기 때문이다.
 * 되돌릴 조건(docs/13 §7)이 왔을 때 여기서 체크 한 번으로 되돌린다.
 */
export default async function TransitionsPage({ params }: { params: Promise<{ key: string }> }) {
  const project = await requireProject(params);

  const [statuses, transitions, inProgress] = await Promise.all([
    prisma.issueStatus.findMany({
      where: { projectId: project.id, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.statusTransition.findMany({
      where: { projectId: project.id },
      include: { from: true, to: true },
      orderBy: [{ from: { sortOrder: "asc" } }, { to: { sortOrder: "asc" } }],
    }),
    // 되돌릴지 정하는 근거. 화면에 박지 않고 **매번 센다** (docs/13 §7).
    prisma.issue.count({
      where: { projectId: project.id, status: { code: "IN_PROGRESS" }, ...notDeleted },
    }),
  ]);

  // (from,to) → 켜져 있나. 행이 없으면 꺼진 것으로 본다.
  const on = new Map(transitions.map((t) => [`${t.fromStatusId}-${t.toStatusId}`, t.isActive]));
  const isOn = (f: number, t: number) => on.get(`${f}-${t}`) === true;


  // 사유 편집은 **켜진 전이만** 보여준다. 막아 둔 길에 문구를 적게 하면 표가 두 배가 된다.
  const active = transitions.filter((t) => t.isActive);
  const reasonOn = active.filter((t) => t.requireNote).length;

  const openCount = statuses.reduce(
    (n, f) => n + statuses.filter((t) => t.id !== f.id && isOn(f.id, t.id)).length,
    0
  );

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>전이 규칙 {openCount}개</h2>
        <p className="admin-hint">
          <b>세로가 지금 상태, 가로가 갈 수 있는 곳</b>입니다. 체크를 끄면 그 길이 막히고
          이슈 화면의 상태 드롭다운에서 <b>아예 사라집니다.</b>
          <br />
          막는 건 <b>처리 경로</b>뿐입니다. <b>Closed</b> 로 가는 길은 모든 상태에 열어 두는 게 좋습니다 —
          잘못 등록한 이슈를 스스로 닫지 못하면 사람들은 엑셀로 돌아갑니다.
        </p>

        <div className="tablewrap" style={{ marginTop: 12 }}>
          <table className="admin-table matrix">
            <thead>
              <tr>
                <th className="corner">
                  <span className="mx-from">지금</span>
                  <span className="mx-to">→ 갈 수 있는 곳</span>
                </th>
                {statuses.map((t) => (
                  <th key={t.id} className="mx-head">
                    <span>
                      <StatusDot color={t.color} />
                      {t.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="mx-row">
                    <span className="uname">
                      <StatusDot color={f.color} />
                      {f.name}
                    </span>
                  </th>
                  {statuses.map((t) => {
                    if (f.id === t.id) {
                      return <td key={t.id} className="mx-self" aria-hidden="true" />;
                    }
                    const active = isOn(f.id, t.id);
                    return (
                      <td key={t.id} className="mx-cell">
                        <form action={toggleTransition}>
      <ProjectField />
                          <input type="hidden" name="fromId" value={f.id} />
                          <input type="hidden" name="toId" value={t.id} />
                          <button
                            type="submit"
                            className={`mx-btn${active ? " on" : ""}`}
                            title={
                              active
                                ? `${f.name} → ${t.name} 막기`
                                : `${f.name} → ${t.name} 허용하기`
                            }
                            aria-label={`${f.name}에서 ${t.name}로 ${active ? "막기" : "허용하기"}`}
                          >
                            {active ? "✓" : ""}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="admin-hint" style={{ marginTop: 14 }}>
          ⚠️ <b>한 상태에서 나가는 길을 전부 끄면 그 상태의 이슈가 갇힙니다.</b>{" "}
          지금은 막지 않지만, 끄기 전에 그 행에 다른 체크가 남아 있는지 확인하세요.
        </p>
      </section>

      {/* ── Reason 5종 (docs/13 §5 · D-06) ───────────────────────────
          요구사항서가 *"한 가지만 고른다면 Reason"* 이라고 한 항목이다. */}
      <section className="admin-sec">
        <h2>사유(Reason)가 필요한 전이 {reasonOn}개</h2>
        <p className="admin-hint">
          <b>상태가 아니라 전이마다</b> 정합니다. 같은 <b>Fixed</b> 라도 어디서 왔느냐에 따라
          적을 것이 다르기 때문입니다 — <code>Merge Pending → Fixed</code> 는 <b>원인·조치</b>,{" "}
          <code>Fixed → Closed</code> 는 <b>확인한 케이스</b>입니다.
          <br />
          ★ <b>안내 문구를 비우지 마세요.</b> 무엇을 적어야 하는지 안 알려주면
          &ldquo;확인함&rdquo; 세 글자가 들어옵니다. 적은 사유는 변경 이력에 남습니다.
        </p>

        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="admin-table reasons">
            <thead>
              <tr>
                <th>전이</th>
                <th>필수</th>
                <th>사유 칸 이름</th>
                <th>무엇을 적나 (안내 문구)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="uname rs-path">
                      <StatusDot color={t.from.color} />
                      {t.from.name}
                      <span className="rs-arrow">→</span>
                      <StatusDot color={t.to.color} />
                      {t.to.name}
                    </span>
                  </td>
                  {/* 한 행이 폼 하나다. 세 칸을 따로 저장하면 "켰는데 문구가 없는" 중간 상태가 생긴다 */}
                  <td>
                    <input type="hidden" name="id" value={t.id} form={`rs${t.id}`} />
                    <input
                      type="checkbox" name="require" value="1"
                      defaultChecked={t.requireNote} form={`rs${t.id}`}
                      aria-label={`${t.from.name}에서 ${t.to.name}로 갈 때 사유 필수`}
                      suppressHydrationWarning
                    />
                  </td>
                  <td>
                    <input
                      name="label" defaultValue={t.noteLabel ?? ""} maxLength={30}
                      placeholder="예: QA Reason" form={`rs${t.id}`}
                      className="rs-label" suppressHydrationWarning
                    />
                  </td>
                  <td>
                    <input
                      name="hint" defaultValue={t.noteHint ?? ""} maxLength={255}
                      placeholder="예: 확인한 환경·버전과 확인한 케이스를 적습니다."
                      form={`rs${t.id}`} className="rs-hint" suppressHydrationWarning
                    />
                  </td>
                  <td>
                    <form action={setTransitionReason} id={`rs${t.id}`}>
      <ProjectField />
                      <button type="submit" className="btn-ghost sm">저장</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="admin-hint" style={{ marginTop: 12 }}>
          요구사항서 04 가 요구한 다섯 가지입니다 —
          <b> Developer Reason</b>(원인·조치·영향 범위) ·
          <b> QA Reason</b>(확인한 환경·케이스 / 재현 조건) ·
          <b> Demand Reason</b>(무엇을 누구에게) ·
          <b> Answer Reason</b>(받은 답변) ·
          <b> Close Reason</b>(닫는 이유 — 이건 종결 사유 코드로 따로 받습니다).
        </p>
      </section>

      <section className="admin-sec">
        <h2>지금 규칙이 이렇게 정해진 이유</h2>
        <p className="admin-hint">
          QA 현업 요구사항서(2026-08-21)의 요구입니다 —
          <i> &ldquo;상태는 정해진 전이만 허용해야 합니다. 자유롭게 아무 값이나 고를 수 있으면
          지금 시트와 다를 게 없습니다.&rdquo;</i>
          <br />
          <br />
          ★ <b>Open → Fixed 직행을 막아 뒀습니다.</b> 이관한 1,704건에는
          <b>In Progress 가 0건</b>이었습니다 — 개발팀이 그 상태를 안 누른다는 뜻이라,
          막으면 이슈가 <b>Open 에 쌓일</b> 위험이 있었습니다.
          <br />
          {/* ★ 이 숫자는 **살아 있어야 한다.** 예전에 "0건입니다" 라고 박아 뒀는데
              실제로 3건이 되면서 화면이 거짓말을 했다. 되돌릴지 말지를 정하는 근거가
              박제된 숫자면, 그 근거를 보고 내리는 판단도 틀린다. */}
          <b>지금 In Progress 는 {inProgress.toLocaleString()}건</b>
          {inProgress === 0
            ? " 입니다. 아직 아무도 안 쓰고 있습니다 — Open 이 계속 쌓이면 되돌릴 때입니다."
            : " 입니다. 경유지가 실제로 쓰이고 있으니 이대로 두면 됩니다."}
          <br />
          되돌리려면 <b>Open</b> 행의 <b>Fixed</b> 칸을 켜면 됩니다.
        </p>
      </section>
    </main>
  );
}
