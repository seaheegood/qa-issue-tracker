import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { firstProjectKey } from "@/lib/project";

/**
 * 들어오는 문.
 *
 * ★ 프로젝트가 주소에 들어가면서 `/issues` 로 바로 보낼 수 없게 됐다.
 *   **내가 속한 프로젝트**를 먼저 찾고, 없으면 아무 프로젝트나 연다.
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const key = await firstProjectKey();
  redirect(key ? `/p/${key}/issues` : "/admin/teams");
}
