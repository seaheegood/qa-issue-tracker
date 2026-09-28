
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { toggleTemplate } from "../actions";
import { TemplateForm } from "./TemplateForm";

export const metadata = { title: "이슈 템플릿 · IssueTracker" };


/**
 * 이슈 템플릿 설정 (요구사항서 09).
 *
 * ★ **목적은 하나다 — 필수값 9개의 부담을 상쇄한다** (`docs/13` 미결 3).
 *   9개를 강제해 놓고 매번 다 채우게 하면 사람들은 엑셀로 돌아간다 (R1).
 *   "콘솔 2차 회귀" 를 고르면 6~7개가 이미 채워져 있고 내용만 쓰면 된다.
 *
 * 차수와 같은 이유로 화면을 준다 — 프로젝트가 돌면 계속 늘어난다 (P-2).
 */
export default async function TemplatesPage({ params }: { params: Promise<{ key: string }> }) {
  const project = await requireProject(params);

  const [templates, rounds, priorities, environments, systems, platforms] = await Promise.all([
    prisma.issueTemplate.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    // ★ 전부 가져온다. 무엇을 뺄지는 **템플릿마다 다르다** — 아래 mastersFor() 참조.
    prisma.round.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: "asc" } }),
    prisma.priority.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: "asc" } }),
    prisma.environment.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: "asc" } }),
    prisma.system.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: "asc" } }),
    prisma.platform.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: "asc" } }),
  ]);

  /**
   * 이 템플릿이 고를 수 있는 것 = **켜진 것 + 이 템플릿이 이미 고른 값** (A-71).
   *
   * ★ 그냥 `isActive` 로만 거르면 안 된다. TemplateForm 의 `<select>` 는 `defaultValue` 라
   *   목록에 없는 값은 `— 안 채움` 으로 그려지는데, saveTemplate 은 템플릿을 **통째로**
   *   저장한다. 그래서 **이름만 고쳐 저장해도 시스템·차수가 조용히 null 이 된다.**
   */
  const pick = <T extends { id: number; isActive: boolean }>(rows: T[], cur: number | null) =>
    rows.filter((r) => r.isActive || r.id === cur);

  const active = {
    rounds: rounds.filter((r) => r.isActive),
    priorities: priorities.filter((r) => r.isActive),
    environments: environments.filter((r) => r.isActive),
    systems: systems.filter((r) => r.isActive),
    platforms: platforms.filter((r) => r.isActive),
  };

  const mastersFor = (t: {
    roundId: number | null; priorityId: number | null;
    environmentId: number | null; systemId: number | null; platformCodes: unknown;
  }) => {
    const codes = (t.platformCodes as string[] | null) ?? [];
    return {
      rounds: pick(rounds, t.roundId),
      priorities: pick(priorities, t.priorityId),
      environments: pick(environments, t.environmentId),
      systems: pick(systems, t.systemId),
      platforms: platforms.filter((p) => p.isActive || codes.includes(p.code)),
    };
  };

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>이슈 템플릿 {templates.length}개</h2>
        <p className="admin-hint">
          등록 화면에서 템플릿을 고르면 <b>적어둔 칸이 미리 채워집니다.</b>
          <br />
          ★ <b>재현 경로</b>에 가장 큰 절감이 있습니다 — 매번 같은 진입 경로를 다시 칩니다.
          <code>1. 관리자 콘솔 로그인</code> 까지 적어두면 그 뒤만 쓰면 됩니다.
          <br />
          비워 둔 칸은 <b>직전에 등록한 값</b>으로 내려갑니다. 전부 채울 필요가 없습니다.
        </p>

        <div className="tpl-admin">
          {templates.map((t) => (
            <TemplateForm key={t.id} t={t} masters={mastersFor(t)} onToggle={toggleTemplate} />
          ))}
        </div>
      </section>

      <section className="admin-sec">
        <h2>새 템플릿</h2>
        <p className="admin-hint">
          자주 반복하는 <b>시스템 + 차수 + 진입 경로</b> 조합을 하나 만들어 두세요.
          이름은 고를 때 보이는 것이라 <b>짧고 알아볼 수 있게</b> 짓는 게 좋습니다 (예: <code>콘솔 2차 회귀</code>).
        </p>
        <div className="tpl-admin">
          {/* 새 템플릿은 새로 고르는 자리다 — 켜진 것만 (A-70) */}
          <TemplateForm t={null} masters={active} onToggle={toggleTemplate} />
        </div>
      </section>
    </main>
  );
}
