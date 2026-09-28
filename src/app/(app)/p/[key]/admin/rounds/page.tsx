import { ProjectField } from "@/components/ProjectField";

import { formatFull } from "@/lib/ui";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { toggleRoundActive } from "../actions";
import { CreateRoundForm, RoundRow } from "./RoundForms";
import { notDeleted } from "@/lib/issue-filter";

export const metadata = { title: "차수 설정 · IssueTracker" };

// ★ 로컬 기준으로 자른다 — `toISOString()` 은 UTC 라 KST 새벽 값이 전날로 찍힌다 (C-40)
const ymd = (d: Date | null) => (d ? formatFull(d) : "");

/**
 * 차수 설정.
 *
 * 우선순위·환경·시스템은 seed 로만 만들어지는데 차수만 화면을 둔 이유는
 * **프로젝트가 돌면서 계속 늘어나기 때문**이다. 3차가 시작될 때마다
 * 개발자를 부를 수는 없다 (P-2 — 차이는 설정으로).
 */
export default async function RoundsPage({ params }: { params: Promise<{ key: string }> }) {
  const project = await requireProject(params);

  const [rounds, unrounded] = await Promise.all([
    prisma.round.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { issues: true } } },
    }),
    prisma.issue.count({ where: { projectId: project.id, roundId: null, ...notDeleted } }),
  ]);
  // 마지막 켜진 하나를 끄지 못하게 하려면 몇 개가 켜져 있는지 알아야 한다 (A-83)
  const activeRounds = rounds.filter((r) => r.isActive).length;

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>차수 {rounds.length}개</h2>
        <p className="admin-hint">
          차수는 <b>테스트 회차</b>입니다. 이슈는 <b>발견 차수</b>를 가질 뿐이라,
          차수가 끝나도 그 이슈는 살아 있습니다.
          <br />
          기간은 <b>비워둬도 됩니다</b> — 시작할 때 끝날 날을 아는 경우가 드뭅니다.
          {/* ★ 예전에 "나중에 번다운 차트가 이걸 x축으로 씁니다" 라고 적어 뒀는데
              번다운 차트는 **없다.** 없는 기능을 약속하면, 기간을 채운 사람이
              나중에 "그래서 그 차트 어디 있냐" 고 묻게 된다. */}
          {" "}적어두면 나중에 차수별 기간 통계를 붙일 때 쓸 수 있습니다
          (<code>docs/10</code> — 아직 만들지 않았습니다).
        </p>

        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="admin-table">
            <thead>
              {/* 칸 너비를 못 박는다 — 안 그러면 날짜 칸이 내용에 따라 흔들려
                  머리글과 값이 어긋나 보인다 */}
              <tr>
                <th>이름</th>
                <th style={{ width: 90 }}>코드</th>
                <th style={{ width: 160 }}>시작</th>
                <th style={{ width: 160 }}>종료</th>
                <th style={{ width: 80, textAlign: "right" }}>이슈</th>
                <th style={{ width: 60 }}>사용</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id} className={r.isActive ? undefined : "off"}>
                  {/* ★ `RoundRow` 가 **`<td>` 넷을 그대로** 돌려준다 (2026-08-24).
                      예전엔 `colSpan={4}` 로 합친 칸 안에서 grid 로 열을 흉내냈는데,
                      그 grid 는 표의 칸 너비와 무관해 값이 머리글 아래에 오지 않았고
                      열이 하나 모자라 `종료` 가 다음 줄로 넘쳤다. */}
                  <RoundRow
                    id={r.id}
                    name={r.name}
                    code={r.code}
                    startedOn={ymd(r.startedOn)}
                    endedOn={ymd(r.endedOn)}
                  />
                  <td className="num">{r._count.issues.toLocaleString()}</td>
                  <td>
                    <form action={toggleRoundActive}>
      <ProjectField />
                      <input type="hidden" name="id" value={r.id} />
                      {/* ★ 마지막 켜진 하나는 끌 수 없다 (A-83) — 우선순위·환경·플랫폼과 같은 규칙.
                          0개가 되면 등록 화면의 차수 칸이 비고, 사람은 "차수를 골라주세요." 만
                          듣는다. 고를 것이 없는데 고르라고 하는 화면이 된다. */}
                      <button type="submit" className={`toggle${r.isActive ? " on" : ""}`}
                              disabled={r.isActive && activeRounds <= 1}
                              title={r.isActive && activeRounds <= 1
                                ? "마지막 하나는 끌 수 없습니다 — 차수가 0개가 되면 이슈를 등록할 수 없습니다"
                                : r.isActive ? "그만 쓰기" : "다시 쓰기"}>
                        <span className="knob" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {unrounded > 0 && (
                <tr className="off">
                  <td className="dim">
                    미분류 <span className="me-tag off">엑셀 이관</span>
                  </td>
                  <td colSpan={3} />
                  <td className="num">{unrounded.toLocaleString()}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="admin-hint" style={{ marginTop: 12 }}>
          <b>지운다는 선택지는 없습니다.</b> 차수를 지우면 그때 발견된 이슈가
          어느 회차 것인지 알 수 없게 됩니다. 안 쓰는 차수는 <b>사용</b>을 끄면
          등록 화면의 선택지에서만 빠지고, 이미 그 차수인 이슈는 그대로 남습니다.
          <br />
          <b>마지막 하나는 끌 수 없습니다</b> — 0개가 되면 아무도 이슈를 등록할 수 없습니다 (A-83).
        </p>
      </section>

      <section className="admin-sec">
        <h2>차수 추가</h2>
        <CreateRoundForm />
      </section>
    </main>
  );
}
