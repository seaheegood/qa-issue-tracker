import { NotificationBell } from "@/components/NotificationBell";
import { requireAdmin } from "@/lib/auth";
import { requireProject } from "@/lib/project";

import { AdminTabs } from "./AdminTabs";

/** 프로젝트별 설정 — 상태 · 전이 규칙 · 차수 · 템플릿. 팀·사용자는 `/admin` 에 있다. */
export default async function ProjectAdminLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ key: string }>;
}) {
  await requireAdmin();
  const project = await requireProject(params);
  return (
    <>
      <AdminTabs projectKey={project.key} projectName={project.name} bell={<NotificationBell />} />
      {children}
    </>
  );
}
