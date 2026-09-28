#!/usr/bin/env bash
#
# DB + 첨부파일 백업.
#
#   npm run backup              # 백업 (복구 검증 포함)
#   npm run backup -- --quick   # 검증 건너뛰기 (급할 때만)
#
# ★ 이 스크립트의 핵심은 6단계(복구 검증)다.
#   덤프 파일이 만들어졌다는 것과 그게 실제로 복구된다는 것은 다른 이야기다.
#   임시 DB에 실제로 부어보고 테이블별 건수까지 대조한 뒤에야 "백업했다"고 말한다.
#
# 보관 위치: ./backups (git 제외됨). IT_BACKUP_DIR 로 바꿀 수 있다.
# 보관 개수: 최근 10개. IT_BACKUP_KEEP 로 바꿀 수 있다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${IT_DB_CONTAINER:-qait-mysql}"
BACKUP_ROOT="${IT_BACKUP_DIR:-$ROOT/backups}"
KEEP="${IT_BACKUP_KEEP:-10}"
QUICK=0
[[ "${1:-}" == "--quick" ]] && QUICK=1

die() { echo "❌ $*" >&2; exit 1; }
step() { echo "  $*"; }

# ── URL 인코딩된 비밀번호를 되돌린다 (%40 → @ 등)
urldecode() { printf '%b' "${1//%/\\x}"; }

# ── 1. 접속 정보
[[ -f .env ]] || die ".env 가 없습니다."
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
[[ -n "$DATABASE_URL" ]] || die ".env 에 DATABASE_URL 이 없습니다."

_u="${DATABASE_URL#mysql://}"
DB_USER="$(urldecode "${_u%%:*}")"
_rest="${_u#*:}"
DB_PASS="$(urldecode "${_rest%%@*}")"
DB_NAME="${_u##*/}"; DB_NAME="${DB_NAME%%\?*}"

# ── 2. 컨테이너 확인
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || die "'$CONTAINER' 가 떠 있지 않습니다.  docker compose up -d"

mysql_q() { docker exec -e MYSQL_PWD="$DB_PASS" -i "$CONTAINER" \
              mysql -u"$DB_USER" -N -B --default-character-set=utf8mb4 "$@" 2>/dev/null; }

# 테이블별 건수를 한 번의 질의로 뽑는다. information_schema 의 TABLE_ROWS 는
# InnoDB 에서 추정값이라 못 쓴다 — COUNT(*) 를 직접 세야 대조가 의미 있다.
table_counts() {
  local db="$1" tables q=""
  tables="$(mysql_q -e "SELECT table_name FROM information_schema.tables
                        WHERE table_schema='$db' AND table_type='BASE TABLE' ORDER BY table_name;")"
  [[ -n "$tables" ]] || return 0
  while read -r t; do
    [[ -n "$t" ]] && q+="SELECT '$t' AS t, COUNT(*) AS c FROM \`$db\`.\`$t\` UNION ALL "
  done <<< "$tables"
  mysql_q -e "${q% UNION ALL } ORDER BY t;"
}

# ── 3. 백업 폴더
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/pt-$STAMP"
mkdir -p "$DEST"
trap 'rm -rf "$DEST"' ERR   # 중간에 실패하면 반쪽 백업을 남기지 않는다

echo
echo "IssueTracker 백업  →  $DEST"
echo "────────────────────────────────────────────────"

# ── 4. DB 덤프
step "① DB 덤프"
docker exec -e MYSQL_PWD="$DB_PASS" "$CONTAINER" mysqldump \
  -u"$DB_USER" \
  --single-transaction \
  --routines --triggers --events \
  --no-tablespaces \
  --default-character-set=utf8mb4 \
  --hex-blob \
  "$DB_NAME" > "$DEST/db.sql" 2>/dev/null || die "mysqldump 실패"

# mysqldump 는 중간에 끊겨도 종료 코드가 0일 때가 있다. 마지막 줄로 확인한다.
tail -5 "$DEST/db.sql" | grep -q "Dump completed" || die "덤프가 중간에 끊겼습니다."
step "   $(wc -l < "$DEST/db.sql" | tr -d ' ') 줄 · $(du -h "$DEST/db.sql" | cut -f1)"

# ── 5. 첨부파일
step "② 첨부파일"
if [[ -d storage && -n "$(find storage -type f -print -quit 2>/dev/null)" ]]; then
  tar -czf "$DEST/storage.tar.gz" storage
  step "   $(find storage -type f | wc -l | tr -d ' ')개 · $(du -h "$DEST/storage.tar.gz" | cut -f1)"
else
  step "   없음 (건너뜀)"
fi

# ── 6. ★ 복구 검증 — 임시 DB 에 실제로 부어본다
VERIFY_RESULT="건너뜀 (--quick)"
if [[ $QUICK -eq 0 ]]; then
  step "③ 복구 검증"
  VDB="${DB_NAME}_verify_$$"
  cleanup_vdb() { mysql_q -e "DROP DATABASE IF EXISTS \`$VDB\`;" || true; }
  trap 'cleanup_vdb; rm -rf "$DEST"' ERR

  mysql_q -e "DROP DATABASE IF EXISTS \`$VDB\`; CREATE DATABASE \`$VDB\`
              CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
  docker exec -e MYSQL_PWD="$DB_PASS" -i "$CONTAINER" \
    mysql -u"$DB_USER" --default-character-set=utf8mb4 "$VDB" < "$DEST/db.sql" 2>/dev/null \
    || die "덤프를 복구하지 못했습니다. 이 백업은 못 씁니다."

  live="$(table_counts "$DB_NAME")"
  rest="$(table_counts "$VDB")"
  cleanup_vdb
  trap 'rm -rf "$DEST"' ERR

  if [[ "$live" != "$rest" ]]; then
    echo "   ── 원본 ──"; echo "$live" | sed 's/^/   /'
    echo "   ── 복구 ──"; echo "$rest" | sed 's/^/   /'
    die "복구본의 건수가 원본과 다릅니다."
  fi
  n_tables="$(echo "$live" | wc -l | tr -d ' ')"
  n_rows="$(echo "$live" | awk '{s+=$2} END {print s+0}')"
  VERIFY_RESULT="통과 — 테이블 ${n_tables}개 · ${n_rows}행 일치"
  step "   ✅ $VERIFY_RESULT"
else
  step "③ 복구 검증 — 건너뜀 (--quick)"
fi

# ── 7. 이력서(manifest). 나중에 "이게 언제 어느 코드의 백업인가"를 답하는 파일
step "④ 이력 기록"
{
  echo "IssueTracker 백업"
  echo "시각        : $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "DB          : $DB_NAME @ $CONTAINER"
  echo "git         : $(git rev-parse --short HEAD 2>/dev/null || echo '-') ($(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-'))"
  echo "마이그레이션 : $(ls prisma/migrations 2>/dev/null | grep -v migration_lock | tail -1 || echo '-')"
  echo "복구 검증    : $VERIFY_RESULT"
  echo
  echo "테이블별 건수"
  table_counts "$DB_NAME" | awk '{printf "  %-24s %8d\n", $1, $2}'
} > "$DEST/manifest.txt"

# ── 8. 압축
gzip -9 "$DEST/db.sql"

# ── 9. 오래된 백업 정리
trap - ERR
# macOS 기본 bash 는 3.2 라 mapfile 이 없다. while-read 로 처리한다.
old_list="$(ls -1d "$BACKUP_ROOT"/pt-* 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) || true)"
if [[ -n "$old_list" ]]; then
  step "⑤ 오래된 백업 정리 (최근 $KEEP 개 유지)"
  while read -r d; do
    [[ -n "$d" ]] || continue
    rm -rf "$d"
    step "   - $(basename "$d")"
  done <<< "$old_list"
fi

echo "────────────────────────────────────────────────"
echo "✅ 완료  $(du -sh "$DEST" | cut -f1)  ·  $DEST"
echo
echo "   복구:  npm run restore -- $(basename "$DEST")"
echo
echo "   ⚠️  이 백업은 DB 와 같은 디스크에 있습니다."
echo "      실수로 지운 것은 되살리지만, 맥이 고장 나면 같이 사라집니다."
echo "      중요한 시점에는 밖으로 한 벌 복사하세요:"
echo "      cp -R \"$DEST\" ~/Library/Mobile\\ Documents/com~apple~CloudDocs/"
echo
