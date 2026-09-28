import { ProjectField } from "@/components/ProjectField";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { toggleSystemActive } from "../actions";
import { CreateSystemForm, SystemRow } from "./SystemForms";

export const metadata = { title: "시스템 설정 · IssueTracker" };

/**
 * 시스템 설정.
 *
 * ★ **이 화면이 없어서 새 프로젝트가 막혀 있었다** (2026-09-04).
 *   시스템은 이슈 등록의 필수값인데, `create-project.ts` 는 시스템을 복제하지 않는다
 *   (당연하다 — `SV`·`SL` 은 첫 프로젝트의 것이다). 그래서 새로 만든 프로젝트는
 *   시스템이 0개고 **이슈를 아예 등록할 수 없었다.** `MALL`·`DW` 가 그 상태였다.
 *
 *   차수에 화면을 준 것과 같은 이유다 — **프로젝트마다 다르고, 계속 늘어난다** (P-2).
 */
export default async function SystemsPage({ params }: { params: Promise<{ key: string }> }) {
  const project = await requireProject(params);

  const systems = await prisma.system.findMany({
    where: { projectId: project.id },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { issues: true } } },
  });
  // 마지막 켜진 하나를 끄지 못하게 하려면 몇 개가 켜져 있는지 알아야 한다 (A-83)
  const activeSystems = systems.filter((x) => x.isActive).length;

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>시스템 {systems.length}개</h2>
        <p className="admin-hint">
          시스템은 <b>이 프로젝트가 담당하는 서비스</b>입니다. 이슈를 등록할 때 <b>반드시</b> 고릅니다.
          <br />
          코드는 <b>영문 두 글자</b>입니다 (<code>SV</code> · <code>SL</code>).
          <br />
          운영자·셀러 같은 <b>쓰는 사람 구분은 받지 않습니다</b> — 프로젝트마다 뜻이 다릅니다 (A-68).
        </p>

        {systems.length === 0 ? (
          /* ★ 빈 상태를 반드시 말한다. 여기가 비면 **이슈를 등록할 수 없다** —
             그 사실을 화면이 말해주지 않으면, 등록 화면에서 빈 드롭다운을 보고
             무엇이 잘못됐는지 알 방법이 없다. */
          <p className="empty" style={{ marginTop: 12 }}>
            아직 시스템이 없습니다. <b>시스템이 하나도 없으면 이슈를 등록할 수 없습니다</b> —
            아래에서 하나 만들어 주세요.
          </p>
        ) : (
          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th style={{ width: 70 }}>코드</th>
                  <th>설명</th>
                  <th style={{ width: 70, textAlign: "right" }}>이슈</th>
                  <th style={{ width: 60 }}>사용</th>
                </tr>
              </thead>
              <tbody>
                {systems.map((s) => (
                  <tr key={s.id} className={s.isActive ? undefined : "off"}>
                    <SystemRow
                      id={s.id} name={s.name} code={s.code}
                      description={s.description ?? ""}
                    />
                    <td className="num">{s._count.issues.toLocaleString()}</td>
                    <td>
                      <form action={toggleSystemActive}>
                        <ProjectField />
                        <input type="hidden" name="id" value={s.id} />
                        {/* ★ 마지막 켜진 하나는 끌 수 없다 (A-83). 끄면 등록이 막히는데,
                            배너는 "하나 만들어 주세요" 라고 해서 이미 있는 것을 또 만들게 된다. */}
                        <button type="submit" className={`toggle${s.isActive ? " on" : ""}`}
                          disabled={s.isActive && activeSystems <= 1}
                          title={s.isActive && activeSystems <= 1
                            ? "마지막 하나는 끌 수 없습니다 — 시스템이 0개가 되면 이슈를 등록할 수 없습니다"
                            : s.isActive ? "그만 쓰기" : "다시 쓰기"}>
                          <span className="knob" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="admin-hint" style={{ marginTop: 12 }}>
          <b>지운다는 선택지는 없습니다.</b> 시스템을 지우면 거기서 나온 이슈가
          어디 것인지 알 수 없게 됩니다. 안 쓰는 시스템은 <b>사용</b>을 끄면 등록 화면의
          선택지에서만 빠지고, 이미 그 시스템인 이슈는 그대로 남습니다.
          <br />
          <b>마지막 하나는 끌 수 없습니다</b> — 0개가 되면 아무도 이슈를 등록할 수 없습니다 (A-83).
          <br />
          <b>코드는 만든 뒤 바꿀 수 없습니다</b> — 공유 링크(<code>?system=</code>)가 그 값을 물고 있습니다.
        </p>
      </section>

      <section className="admin-sec">
        <h2>시스템 추가</h2>
        <CreateSystemForm />
      </section>
    </main>
  );
}
