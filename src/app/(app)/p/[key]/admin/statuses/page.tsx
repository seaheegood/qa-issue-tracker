import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";
import { StatusDot } from "@/lib/ui";


export const metadata = { title: "상태 설정 · IssueTracker" };


const CATEGORY_LABEL: Record<string, string> = {
  OPEN: "미해결", PENDING: "대기", RESOLVED: "처리됨", CLOSED: "종결",
};

export default async function StatusesPage({ params }: { params: Promise<{ key: string }> }) {
  const project = await requireProject(params);

  const statuses = await prisma.issueStatus.findMany({
    where: { projectId: project.id },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { issues: true } } },
  });

  // ★ **상태는 8종 고정이다** (2026-08-24).
  //   예전에는 안 쓰기로 한 둘을 비활성으로 남겨 뒀는데, 그것 때문에 화면마다
  //   "이건 왜 아직 있지?" 라는 질문을 받았다. 남겨두는 것 자체가 혼란이었다 — 지웠다.
  const active = statuses.filter((s) => s.isActive);

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>쓰는 상태 {active.length}종</h2>
        <p className="admin-hint">
          프로젝트가 쓰는 상태와 각 상태에 걸린 이슈 수입니다.
          <br />
          ★ <b>사유 필요는 여기서 정하지 않습니다.</b> 2026-08-22 부터{" "}
          <b>전이 규칙</b>으로 옮겼습니다 — 같은 <b>Fixed</b> 라도 어디서 왔느냐에 따라
          적을 것이 다르기 때문입니다 (<code>Merge Pending → Fixed</code> 는 원인·조치,{" "}
          <code>Fixed → Closed</code> 는 확인한 케이스).
        </p>

        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>상태</th>
                <th>분류</th>
                <th style={{ textAlign: "right" }}>이슈</th>

              </tr>
            </thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="uname">
                      <StatusDot color={s.color} />
                      {s.name}
                      {s.isInitial && <span className="me-tag">등록 시 기본</span>}
                      {!s.isActive && <span className="me-tag off">쓰지 않음</span>}
                    </span>
                  </td>
                  <td className="dim">{CATEGORY_LABEL[s.category] ?? s.category}</td>
                  <td className="num">{s._count.issues.toLocaleString()}</td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      <section className="admin-sec">
        <h2>전이 규칙</h2>
        <p className="admin-hint">
          어느 상태에서 어느 상태로 갈 수 있는지는 <b>전이 규칙</b>이 정합니다.
          허용되지 않은 상태는 이슈 화면의 드롭다운에 <b>아예 뜨지 않습니다.</b>
          <br />
          <Link href={`/p/${project.key}/admin/transitions`} className="admin-link">전이 규칙 설정 →</Link>
        </p>
      </section>
    </main>
  );
}
