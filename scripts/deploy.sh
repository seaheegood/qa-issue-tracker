#!/usr/bin/env bash
#
# 운영 PC(회사 맥)에서 새 버전으로 올린다.
#
#   npm run deploy               # 가장 최근 태그로
#   npm run deploy -- v0.7.0     # 그 태그로 (되돌릴 때도 같은 명령)
#
# ★ 이 스크립트는 **운영 PC 에서만** 돈다. 개발 맥에서는 쓸 일이 없다.
#   개발 맥은 작업 → 커밋 → 하루 끝 태그 · push (CLAUDE.md «하루를 마칠 때»).
#   운영 PC 는 그 **태그**만 받는다. `main` 을 그대로 받지 않는 이유 —
#   버전이 안 붙은 반쪽 작업이 동료 앞에 서지 않게 하려고.
#
# 하는 일 (순서가 중요하다)
#   ① 백업 (복구 검증 포함)  — 마이그레이션이 데이터를 바꾸기 **전에**
#   ② 태그 받기 · 꺼내기
#   ③ npm ci                — package-lock 그대로. `install` 은 lock 을 고칠 수 있다
#   ④ prisma migrate deploy — 새 마이그레이션만 적용
#   ⑤ 빌드                  — 실패하면 여기서 멈추고, 떠 있는 서버는 **옛 빌드 그대로** 산다
#   ⑥ pm2 재시작 · ⑦ 응답 확인
#
# 되돌리기: npm run deploy -- <이전 태그>  →  데이터까지 되돌려야 하면
#           npm run restore -- <①에서 만든 백업>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ★ ②에서 `git checkout` 이 **이 파일 자신**을 바꾼다. bash 는 스크립트를 읽어 가며
#   실행하므로, 도는 중에 파일이 바뀌면 엉뚱한 줄부터 이어 읽는다.
#   먼저 임시 사본으로 옮겨 타고, 원본은 마음껏 바뀌게 둔다.
if [[ -z "${IT_DEPLOY_COPY:-}" ]]; then
  tmp="$(mktemp -t pt-deploy)"
  cp "${BASH_SOURCE[0]}" "$tmp"
  IT_DEPLOY_COPY=1 IT_DEPLOY_ROOT="$ROOT" exec bash "$tmp" "$@"
fi
ROOT="${IT_DEPLOY_ROOT:-$ROOT}"
cd "$ROOT"

APP="${IT_PM2_NAME:-pt}"
PORT="${PORT:-3000}"

die() { echo "❌ $*" >&2; exit 1; }
step() { echo "  $*"; }

command -v pm2 >/dev/null || die "pm2 가 없습니다.  npm install -g pm2   (docs/16 7장)"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] \
  || die "운영 PC 에서 코드가 고쳐져 있습니다. 여기서는 고치지 않습니다 — git status 로 확인하세요."

echo
echo "IssueTracker 배포"
echo "────────────────────────────────────────────────"
FROM="$(git describe --tags --always 2>/dev/null || echo '?')"

# ── ① 백업
step "① 백업"
bash scripts/backup.sh 2>&1 | grep -E '✅|❌|복구:' | sed 's/^ */     /'

# ── ② 태그
step "② 태그 받기"
git fetch --tags --quiet origin
TAG="${1:-$(git tag --list 'v*' --sort=-v:refname | head -1)}"
[[ -n "$TAG" ]] || die "태그가 없습니다."
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || die "'$TAG' 라는 태그가 없습니다."
git -c advice.detachedHead=false checkout --quiet "$TAG"
step "   $FROM  →  $TAG"

# ── ③ 의존성
step "③ npm ci"
npm ci --no-audit --no-fund >/tmp/pt-deploy-npm.log 2>&1 || { tail -20 /tmp/pt-deploy-npm.log; die "npm ci 실패"; }

# ── ④ 마이그레이션
step "④ 마이그레이션"
npx prisma migrate deploy 2>&1 | grep -E 'applied|No pending|Error' | sed 's/^/     /' || true

# ── ⑤ 빌드
step "⑤ 빌드 (1~2분)"
npm run build >/tmp/pt-build.log 2>&1 || { tail -20 /tmp/pt-build.log; die "빌드 실패 — 서버는 옛 빌드로 계속 떠 있습니다"; }

# ── ⑥ 재시작
step "⑥ 재시작"
if pm2 describe "$APP" >/dev/null 2>&1; then
  pm2 restart "$APP" --update-env >/dev/null
else
  # 처음 한 번. serve.sh 가 백업·주소 안내를 하므로 그걸 띄운다 (빌드는 방금 했다)
  IT_SKIP_BACKUP=1 pm2 start "npm run serve -- --skip-build" --name "$APP" >/dev/null
  pm2 save >/dev/null
  step "   pm2 에 '$APP' 으로 등록했습니다. 재부팅에도 뜨게 하려면 한 번만:  pm2 startup"
fi

# ── ⑦ 응답 확인 — 떠 있다는 것과 응답한다는 것은 다르다
step "⑦ 응답 확인"
code=""
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login" || true)"
  [[ "$code" == "200" ]] && break
  sleep 1
done
[[ "$code" == "200" ]] || die "/login 이 200 을 주지 않습니다 ($code).  pm2 logs $APP"

echo "────────────────────────────────────────────────"
echo "✅ v$(node -p "require('./package.json').version") 로 올렸습니다  ($TAG)"
echo
