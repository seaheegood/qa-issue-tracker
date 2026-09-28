import { saveTemplate } from "../actions";
import { ProjectField } from "@/components/ProjectField";

/**
 * 템플릿 한 장 = 폼 하나.
 *
 * ★ 칸을 따로 저장하지 않는다. 따로 저장하면 *"이름은 바꿨는데 경로는 안 바뀐"*
 *   중간 상태가 생긴다 — 전이 규칙의 Reason 표와 같은 판단이다.
 */
type Opt = { id: number; name: string };

/**
 * 템플릿의 드롭다운 한 칸.
 *
 * ★ **컴포넌트 밖에 둔다.** 예전엔 `TemplateForm` 안에서 정의했는데,
 *   그러면 렌더할 때마다 **새로운 컴포넌트 타입**이 만들어진다. React 는 그걸
 *   *"다른 컴포넌트"* 로 보고 **트리를 통째로 버리고 새로 만든다** —
 *   고르던 값과 포커스가 날아가고, 리렌더가 필요 없는데도 매번 다시 그린다.
 *   (`react-hooks/static-components` 가 잡아 준다)
 */
function Select({ name, opts, cur, none }: {
  name: string; opts: Opt[]; cur: number | null; none: string;
}) {
  return (
    <label>
      <span>{none.replace("— ", "")}</span>
      <select name={name} defaultValue={cur ?? ""} suppressHydrationWarning>
        <option value="">— 안 채움</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

export function TemplateForm({
  t, masters, onToggle,
}: {
  t: {
    id: number; name: string; testPath: string | null; expected: string | null;
    foundVersion: string | null; screenName: string | null;
    roundId: number | null; priorityId: number | null;
    environmentId: number | null; systemId: number | null;
    platformCodes: unknown; isActive: boolean;
  } | null;
  masters: {
    rounds: Opt[]; priorities: Opt[]; environments: Opt[]; systems: Opt[];
    platforms: { code: string; name: string }[];
  };
  onToggle: (fd: FormData) => Promise<void>;
}) {
  const picked = (t?.platformCodes as string[] | null) ?? [];

  return (
    <div className={`tpl-card${t && !t.isActive ? " off" : ""}`}>
      <form action={saveTemplate} className="tpl-form">
      <ProjectField />
        {t && <input type="hidden" name="id" value={t.id} />}

        <div className="tpl-row1">
          <label className="grow">
            <span>이름</span>
            <input
              name="name" defaultValue={t?.name ?? ""} required maxLength={60}
              placeholder="예: 콘솔 2차 회귀" suppressHydrationWarning
            />
          </label>
          <button type="submit" className="btn-primary sm">{t ? "저장" : "만들기"}</button>
        </div>

        <label>
          <span>재현 경로 <b className="tpl-star">가장 큰 절감</b></span>
          <textarea
            name="testPath" rows={3} defaultValue={t?.testPath ?? ""}
            placeholder={"1. 관리자 콘솔 로그인\n2. \n3. "}
            suppressHydrationWarning
          />
        </label>

        <label>
          <span>기대 결과</span>
          <textarea
            name="expected" rows={2} defaultValue={t?.expected ?? ""}
            placeholder="자주 쓰는 형식이 있으면 적어두세요 (비워도 됩니다)"
            suppressHydrationWarning
          />
        </label>

        <div className="tpl-grid">
          <label>
            <span>검출 버전</span>
            <input name="foundVersion" defaultValue={t?.foundVersion ?? ""} maxLength={50}
              placeholder="예: v1.2.0" suppressHydrationWarning />
          </label>
          <label>
            <span>화면</span>
            <input name="screenName" defaultValue={t?.screenName ?? ""} maxLength={255}
              placeholder="예: 상품 목록" suppressHydrationWarning />
          </label>
          <Select name="systemId" opts={masters.systems} cur={t?.systemId ?? null} none="— 시스템" />
          <Select name="roundId" opts={masters.rounds} cur={t?.roundId ?? null} none="— 차수" />
          <Select name="priorityId" opts={masters.priorities} cur={t?.priorityId ?? null} none="— 우선순위" />
          <Select name="environmentId" opts={masters.environments} cur={t?.environmentId ?? null} none="— 환경" />
        </div>

        <fieldset className="tpl-plats">
          <legend>플랫폼</legend>
          {masters.platforms.map((p) => (
            <label key={p.code}>
              <input
                type="checkbox" name="platform" value={p.code}
                defaultChecked={picked.includes(p.code)} suppressHydrationWarning
              />
              {p.name}
            </label>
          ))}
        </fieldset>
      </form>

      {t && (
        <form action={onToggle} className="tpl-toggle">
      <ProjectField />
          <input type="hidden" name="id" value={t.id} />
          <button type="submit" className="btn-ghost sm">
            {t.isActive ? "쓰지 않기" : "다시 쓰기"}
          </button>
        </form>
      )}
    </div>
  );
}
