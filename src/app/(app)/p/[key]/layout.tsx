import { ProjectProvider } from "@/components/ProjectField";
import { Shell } from "@/components/Shell";
import { requireProject } from "@/lib/project";

/**
 * 프로젝트 안의 모든 화면이 지나는 곳.
 *
 * 여기서 프로젝트를 한 번 풀고 컨텍스트에 심는다 — 아래의 폼들이
 * `<ProjectField />` 한 줄로 그걸 실어 보낸다.
 * 없는 프로젝트면 `requireProject` 가 404 를 낸다.
 */
export default async function ProjectLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ key: string }>;
}) {
  const project = await requireProject(params);
  return (
    <ProjectProvider value={project.key}>
      <Shell projectKey={project.key}>{children}</Shell>
    </ProjectProvider>
  );
}
