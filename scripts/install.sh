#!/usr/bin/env bash
#
# 운영 PC 처음 설치 — clone 한 폴더에서 한 번 돌린다.
#
#     bash scripts/install.sh
#
# 절차 전체와 «그 전에» 깔아야 할 것(Homebrew · git · Node · OrbStack · GitHub 키)은
# docs/26-운영PC-설치.md. 이 스크립트는 **그 다음부터**를 맡는다.
#
# 하는 일 (이미 된 단계는 건너뛴다 — 몇 번을 돌려도 된다)
#   ⓪ 준비물 확인 — 없으면 **무엇을 깔아야 하는지 말하고 멈춘다.** 대신 깔지 않는다
#   ① 최신 태그로 선다 — `main` 이 아니라 태그 (deploy.sh 와 같은 이유)
#   ② .env 만들기          ③ DB 켜기 (docker compose)
#   ④ npm ci               ⑤ 표 만들기 (prisma migrate deploy)
#   ⑥ 첫 프로젝트 (없을 때만 · 키와 이름을 묻는다)
#   ⑦ 첫 관리자 (없을 때만 · 아이디·이름·비밀번호를 묻는다)
#   ⑧ pm2 설치 → npm run deploy (빌드 · 띄우기 · 응답 확인)
#   ⑨ 남은 손일 안내 — `pm2 startup` 은 sudo 가 필요해서 사람이 한다
#
# ⚠️ 이 스크립트는 **운영 PC** 용이다. 개발 PC 는 README «빠른 시작».

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ★ ①에서 `git checkout <태그>` 가 **이 파일 자신**을 바꿀 수 있다 (deploy.sh 와 같은 함정).
#   bash 는 파일을 읽어 가며 실행하므로 임시 사본으로 옮겨 탄다.
if [[ -z "${IT_INSTALL_COPY:-}" ]]; then
  tmp="$(mktemp -t it-install)"
  cp "${BASH_SOURCE[0]}" "$tmp"
  IT_INSTALL_COPY=1 IT_INSTALL_ROOT="$ROOT" exec bash "$tmp" "$@"
fi
ROOT="${IT_INSTALL_ROOT:-$ROOT}"
cd "$ROOT"

CONTAINER="${IT_DB_CONTAINER:-qait-mysql}"
NODE_WANT="$(tr -d ' v\n' < .nvmrc 2>/dev/null || echo 24)"

die()  { echo; echo "❌ $*" >&2; echo "   절차: docs/26-운영PC-설치.md" >&2; exit 1; }
step() { echo; echo "── $*"; }
ok()   { echo "   ✅ $*"; }
skip() { echo "   ↷ $* (이미 됨)"; }

echo
echo "IssueTracker 운영 PC 설치"
echo "════════════════════════════════════════════════"

# ── ⓪ 준비물 ────────────────────────────────────────
step "⓪ 준비물 확인"
missing=()
command -v git    >/dev/null || missing+=("git       → brew install git")
command -v node   >/dev/null || missing+=("Node $NODE_WANT   → brew install node@$NODE_WANT && brew link --overwrite --force node@$NODE_WANT")
command -v docker >/dev/null || missing+=("Docker    → brew install --cask orbstack  (설치 후 OrbStack 을 한 번 열어 둔다)")
if ((${#missing[@]})); then
  echo "   아직 없는 것:"
  for m in "${missing[@]}"; do echo "     · $m"; done
  die "위 것을 깔고 다시 돌려 주세요 (docs/26 1장)."
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  die "Node $node_major 은 너무 옛날입니다. $NODE_WANT 이 필요합니다 (docs/26 1-3)."
elif [[ "$node_major" != "$NODE_WANT" ]]; then
  echo "   ⚠️  Node $node_major — 이 저장소가 정한 버전은 $NODE_WANT (.nvmrc). 되긴 하지만 맞추기를 권합니다 (docs/26 1-3)"
fi
docker info >/dev/null 2>&1 || die "Docker 가 꺼져 있습니다. OrbStack(또는 Docker Desktop)을 열고 다시 돌려 주세요."
ok "git $(git --version | awk '{print $3}') · Node $(node -v) · Docker $(docker version -f '{{.Server.Version}}' 2>/dev/null)"

# ── ① 최신 태그 ─────────────────────────────────────
step "① 최신 태그로 서기"
git fetch --tags --quiet origin 2>/dev/null || echo "   ⚠️  원격에 못 닿았습니다 — 받아 둔 태그로 진행합니다"
TAG="$(git tag --list 'v*' --sort=-v:refname | head -1)"
[[ -n "$TAG" ]] || die "태그가 없습니다. clone 이 끝까지 됐는지 보세요."
if [[ "$(git describe --tags --exact-match 2>/dev/null || true)" == "$TAG" ]]; then
  skip "$TAG"
else
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] \
    || die "이 폴더에서 코드가 고쳐져 있습니다. 운영 PC 에서는 고치지 않습니다 (git status)."
  git -c advice.detachedHead=false checkout --quiet "$TAG"
  ok "$TAG"
fi

# ── ② .env ─────────────────────────────────────────
step "② .env"
HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
if [[ -f .env ]]; then
  skip ".env 있음"
else
  cp .env.example .env
  # 지라 본문의 «되돌아오는 링크» 앞부분 (J-19). 동료가 여는 주소와 같아야 한다
  printf '\n# 이 PC 의 주소 — install.sh 가 넣었다 (docs/26)\nIT_BASE_URL=http://%s.local:3000\n' "$HOST" >> .env
  ok ".env 만듦 · IT_BASE_URL=http://$HOST.local:3000"
fi

# ── ③ DB ───────────────────────────────────────────
step "③ DB 켜기"
docker compose up -d >/dev/null 2>&1 || die "docker compose up 실패. 'docker compose up -d' 를 직접 돌려 메시지를 보세요."
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" == "healthy" ]] \
  || die "DB 가 2분 안에 준비되지 않았습니다.  docker compose logs db"
ok "$CONTAINER healthy (첫 실행은 MySQL 이미지를 받느라 몇 분 걸릴 수 있다)"

# ── ④ npm ci ───────────────────────────────────────
step "④ 패키지 설치 (npm ci · 1~3분)"
if [[ -d node_modules && node_modules/.package-lock.json -nt package-lock.json ]]; then
  skip "node_modules 최신"
else
  npm ci --no-audit --no-fund >/tmp/it-install-npm.log 2>&1 || { tail -20 /tmp/it-install-npm.log; die "npm ci 실패"; }
  ok "설치됨"
fi

# ── ⑤ 표 ───────────────────────────────────────────
step "⑤ 표 만들기"
npx prisma migrate deploy 2>&1 | grep -E "applied|No pending|Error" | sed 's/^/   /' || true

# DB 에 직접 묻는다 (backup.sh 와 같은 방식)
urldecode() { printf '%b' "${1//%/\\x}"; }
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
_u="${DATABASE_URL#mysql://}"; DB_USER="$(urldecode "${_u%%:*}")"; _r="${_u#*:}"
DB_PASS="$(urldecode "${_r%%@*}")"; DB_NAME="${_u##*/}"; DB_NAME="${DB_NAME%%\?*}"
q() { docker exec -e MYSQL_PWD="$DB_PASS" "$CONTAINER" mysql -u"$DB_USER" -N -B "$DB_NAME" -e "$1" 2>/dev/null; }

# ── ⑥ 첫 프로젝트 ──────────────────────────────────
step "⑥ 첫 프로젝트"
if [[ "$(q 'SELECT COUNT(*) FROM projects')" != "0" ]]; then
  skip "프로젝트 $(q 'SELECT COUNT(*) FROM projects')개"
else
  echo "   이슈번호 앞에 붙는 약자와 이름을 정합니다. 예) 키 WEB · 이름 웹 서비스 → 이슈번호 WEB-1"
  read -r -p "   키 (영문 대문자 2~10자): " PKEY
  read -r -p "   이름: " PNAME
  # setup 이 끝에 찍는 «다음 할 일» 은 이 스크립트가 이어서 하므로 뗀다 (⑦ · 끝의 남은 손일)
  npm run -s setup -- "$PKEY" "$PNAME" | sed '/^다음 할 일/,$d' | sed 's/^/   /'
fi

# ── ⑦ 첫 관리자 ────────────────────────────────────
step "⑦ 첫 관리자"
if [[ "$(q "SELECT COUNT(*) FROM users WHERE system_role='ADMIN' AND is_active=1")" != "0" ]]; then
  skip "관리자 있음"
else
  echo "   이 사람으로 처음 로그인해 나머지(시스템·팀·동료 계정)를 화면에서 만듭니다."
  read -r -p "   아이디 (영문 소문자·숫자·점): " AID
  read -r -p "   이름: " ANAME
  read -r -s -p "   비밀번호 (8자 이상 · 화면에 안 보입니다): " APW; echo
  npm run -s user -- create "$AID" "$ANAME" "$APW" --admin | sed 's/^/   /'
  unset APW
fi

# ── ⑧ 띄우기 ───────────────────────────────────────
step "⑧ 빌드하고 띄우기 (pm2)"
if ! command -v pm2 >/dev/null; then
  npm install -g pm2 >/tmp/it-install-pm2.log 2>&1 || { tail -10 /tmp/it-install-pm2.log; die "pm2 설치 실패 — 'npm install -g pm2' 를 직접 돌려 보세요"; }
  ok "pm2 설치"
fi
bash scripts/deploy.sh "$TAG"

# ── ⑨ 남은 손일 ────────────────────────────────────
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
echo
echo "════════════════════════════════════════════════"
echo "✅ 설치 끝.  동료에게 알려 줄 주소:"
echo
echo "     http://$HOST.local:3000"
[[ -n "$IP" ]] && echo "     (이름으로 안 열리면) http://$IP:3000"
echo
echo "남은 손일 — docs/26 4장"
echo "  1. 재부팅해도 뜨게:  pm2 startup   → 찍어 주는 sudo 명령을 그대로 붙여 넣고,  pm2 save"
echo "  2. 브라우저로 로그인 → 프로젝트 설정 › 시스템 ★ 제일 먼저 (없으면 이슈 등록이 막힌다)"
echo "  3. 관리자 설정 › 팀 → 사용자 (임시 비밀번호가 한 번 뜬다)"
echo "  4. 다른 기기에서 위 주소로 열리는지"
echo
