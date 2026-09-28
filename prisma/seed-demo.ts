/**
 * 데모 DB 만들기 — 공개 배포용 (해커톤 제출 · 2026-09-20)
 *
 *     IT_DEMO_SEED=1 npx tsx prisma/seed-demo.ts
 *
 * ★★ **사내 데이터는 한 줄도 들어가지 않는다.**
 *   프로젝트·사람·이슈·코멘트가 전부 **여기서 지어낸 가공의 것**이다.
 *   거래처명·실명은 물론이고, 실제 이슈 본문도 쓰지 않는다.
 *   가져오는 것은 **설정의 «모양»** 뿐이다 — 상태 9종, 전이 규칙, 우선순위·환경·플랫폼.
 *   설정은 사람이나 거래처가 아니라 **이 앱이 무엇을 할 줄 아는가**이기 때문이다.
 *
 * ★ **일부러 `prisma/seed.ts` 와 따로 뒀다.** 그쪽은 `data/*.json`(사내 실데이터)을 읽는다.
 *   한 파일에 분기를 두면 언젠가 데모 배포가 실데이터를 읽는다. 파일을 나누면 그럴 수 없다.
 *
 * ⚠️ **이 스크립트는 대상 DB 를 비운다.** 그래서 두 겹으로 막아 뒀다:
 *   ① `IT_DEMO_SEED=1` 이 없으면 안 돈다
 *   ② 접속 주소가 로컬(127.0.0.1 · localhost)이면 `IT_DEMO_SEED_LOCAL=1` 까지 있어야 돈다
 *   ②가 없으면 실수로 한 줄 붙여넣었을 때 **내 개발 DB 가 날아간다.**
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { adapterInput } from "../src/lib/db-url";
import { STATUSES, createMasters } from "./masters";

// ─────────────────────────────────────────────────────────────
// 0. 안전장치
// ─────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL 이 없습니다.");
if (process.env.IT_DEMO_SEED !== "1") {
  console.error("이 스크립트는 대상 DB 를 비웁니다. 정말 실행하려면 IT_DEMO_SEED=1 을 붙이세요.");
  process.exit(1);
}
// 어디를 비우려는지 먼저 말한다. 주소 파싱은 `db-url.ts` 의 것과 같은 규칙을 쓴다.
const host = DB_URL.replace(/^[a-z]+:\/\//i, "").split("@").pop()!.split(/[:/?]/)[0] || "?";
if (/^(127\.0\.0\.1|localhost|::1)$/.test(host) && process.env.IT_DEMO_SEED_LOCAL !== "1") {
  console.error(`대상이 로컬 DB(${host}) 입니다. 개발 DB 를 지우려는 게 맞다면 IT_DEMO_SEED_LOCAL=1 도 붙이세요.`);
  process.exit(1);
}
console.log(`대상 DB 호스트: ${host}`);

// ★ 앱과 **같은 함수**로 접속 모양을 정한다 (`src/lib/db-url.ts`).
//   여기서 주소 문자열을 그대로 넘기면 TLS 가 필수인 관리형 DB 에 **시드만 못 붙는다.**
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(adapterInput(DB_URL)) });

/** 데모 계정 비밀번호. 로그인 화면에도 같은 값을 안내한다(`IT_DEMO=1`). */
const DEMO_PW = process.env.IT_DEMO_PASSWORD ?? "demo1234";

// ─────────────────────────────────────────────────────────────
// 1. 되풀이해도 같은 결과가 나오게 — 고정 씨앗 난수
//
// ★ `Math.random()` 을 쓰면 돌릴 때마다 데이터가 달라져서,
//   "어제 찍은 스크린샷과 지금 화면이 다르다" 가 된다. 심사용으론 치명적이다.
// ─────────────────────────────────────────────────────────────
let _s = 20260920;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

/** 기준 시각 — 오늘 0시. 이슈는 이 앞 45일에 흩어 놓는다(추이 그래프가 살아야 한다). */
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const daysAgo = (d: number, h = 10, m = 0) => {
  const t = new Date(TODAY); t.setDate(t.getDate() - d); t.setHours(h, m, 0, 0); return t;
};

// ─────────────────────────────────────────────────────────────
// 2. 설정 — 실제 앱이 쓰는 것과 같은 «모양»
// ─────────────────────────────────────────────────────────────
// ★ 2026-09-28 — `prisma/masters.ts` 로 옮겼다. 빈 DB 부트스트랩(`seed-init.ts`)과 같은 것을 쓴다.

// ─────────────────────────────────────────────────────────────
// 3. 가공의 팀 · 사람
//
// ★ 이름은 전부 지어낸 것이다. 회사의 누구와도 겹치지 않도록
//   흔하지 않은 조합을 골랐고, 아이디는 앱의 표기 규칙(`이름약자.성`)만 따랐다.
// ─────────────────────────────────────────────────────────────
const TEAMS = [
  { name: "개발1팀", color: "#3b82c4", role: "DEV"     as const, sortOrder: 1 },
  { name: "개발2팀", color: "#5e6ad2", role: "DEV"     as const, sortOrder: 2 },
  { name: "QA팀",    color: "#0d9488", role: "QA"      as const, sortOrder: 3 },
  { name: "기획팀",  color: "#8b5cd6", role: "PLANNER" as const, sortOrder: 4 },
  { name: "운영팀",  color: "#dd7a29", role: null,               sortOrder: 5 },
];

const USERS = [
  { loginId: "demo",     name: "데모 관리자", team: "QA팀",    role: "ADMIN"  as const },
  { loginId: "sr.jang",  name: "장서린",     team: "QA팀",    role: "MEMBER" as const },
  { loginId: "hw.moon",  name: "문하운",     team: "QA팀",    role: "MEMBER" as const },
  { loginId: "yb.seo",   name: "서유빈",     team: "QA팀",    role: "MEMBER" as const },
  { loginId: "jh.pyo",   name: "표준혁",     team: "개발1팀", role: "MEMBER" as const },
  { loginId: "db.ryu",   name: "류도빈",     team: "개발1팀", role: "MEMBER" as const },
  { loginId: "mj.sagong", name: "사공민주",  team: "개발2팀", role: "MEMBER" as const },
  { loginId: "ah.gu",    name: "구아현",     team: "기획팀",  role: "MEMBER" as const },
  { loginId: "tw.eom",   name: "엄태우",     team: "운영팀",  role: "MEMBER" as const },
];

// ─────────────────────────────────────────────────────────────
// 4. 가공의 프로젝트 둘 — 멀티 프로젝트가 기본이라는 걸 보이려면 둘은 있어야 한다 (P-1)
// ─────────────────────────────────────────────────────────────
const PROJECTS = [
  {
    key: "SHOP", prefix: "SHOP", name: "데모 커머스",
    description: "가공의 오픈마켓. 이 트래커를 시연하기 위해 만든 예시 프로젝트입니다.",
    systems: [
      { code: "AC", name: "관리자 콘솔", userType: "OPERATOR" as const, platform: "WEB" as const, description: "내부 운영자가 입점사와 상품을 관리" },
      { code: "ST", name: "판매자 센터", userType: "SELLER"   as const, platform: "WEB" as const, description: "입점 판매자가 상품·주문·정산을 처리" },
      { code: "FR", name: "고객 프론트", userType: "CUSTOMER" as const, platform: "WEB" as const, description: "고객이 상품을 보고 주문" },
      { code: "AP", name: "고객 앱",     userType: "CUSTOMER" as const, platform: "APP" as const, description: "AOS · iOS 고객용 앱" },
    ],
    rounds: [
      { code: "R1", name: "1차", startedOn: daysAgo(45), endedOn: daysAgo(24) },
      { code: "R2", name: "2차", startedOn: daysAgo(23), endedOn: null },
    ],
    issueCount: 64,
  },
  {
    key: "BOOK", prefix: "BK", name: "데모 예약 서비스",
    description: "두 번째 프로젝트. 설정이 프로젝트마다 따로 논다는 걸 보이기 위한 예시입니다.",
    systems: [
      { code: "BW", name: "예약 웹",   userType: "CUSTOMER" as const, platform: "WEB" as const, description: "고객이 예약을 잡는 화면" },
      { code: "BA", name: "예약 어드민", userType: "OPERATOR" as const, platform: "WEB" as const, description: "운영자가 예약을 관리" },
    ],
    rounds: [{ code: "R1", name: "1차", startedOn: daysAgo(20), endedOn: null }],
    issueCount: 14,
  },
];

// ─────────────────────────────────────────────────────────────
// 5. 가공의 이슈 재료
//
// ★ 실제 이슈 본문을 한 줄도 쓰지 않는다. 오픈마켓이라면 누구나 떠올릴
//   일반적인 상황만 적었다 — 쿠폰·배송지·정산처럼 도메인은 있지만 내용은 지어낸 것.
// ─────────────────────────────────────────────────────────────
type Seed = { t: string; path: string; body: string; exp: string; sys: string };

const SHOP_ISSUES: Seed[] = [
  { sys: "FR", t: "장바구니에서 수량을 0으로 바꾸면 합계가 음수로 표시됩니다",
    path: "1. 고객 프론트 로그인\n2. 상품 상세 > 장바구니 담기\n3. 장바구니에서 수량 입력란에 0 입력",
    body: "수량 입력란에 0 을 직접 입력하면 합계 금액이 -3,000원 으로 표시됩니다.\n주문서로 넘어가면 결제 금액이 0원으로 바뀌어 결제까지 진행됩니다.",
    exp: "수량은 1 미만으로 내려가지 않아야 하고, 0 입력 시 1 로 보정되거나 삭제 여부를 물어야 합니다." },
  { sys: "FR", t: "쿠폰 두 장을 동시에 적용하면 할인액이 중복 차감됩니다",
    path: "1. 쿠폰 2장 보유 계정으로 로그인\n2. 주문서 진입\n3. 쿠폰 적용 > 다른 쿠폰으로 변경",
    body: "쿠폰을 바꿔 적용하면 이전 쿠폰 할인액이 회수되지 않고 누적됩니다.\n3번 반복하면 상품가보다 할인액이 커집니다.",
    exp: "쿠폰은 1장만 적용되어야 하며, 변경 시 이전 할인액이 원복되어야 합니다." },
  { sys: "FR", t: "배송지 목록에서 기본 배송지를 삭제하면 주문서가 빈 화면이 됩니다",
    path: "1. 마이페이지 > 배송지 관리\n2. 기본 배송지 삭제\n3. 상품 주문 시도",
    body: "기본 배송지를 지운 뒤 주문서로 들어가면 배송지 영역이 통째로 비어 있고,\n다른 배송지를 고를 버튼도 나오지 않습니다.",
    exp: "기본 배송지가 없으면 「배송지 추가」 버튼이 보여야 합니다." },
  { sys: "FR", t: "상품 검색 결과에서 품절 상품이 정렬 상단에 노출됩니다",
    path: "1. 검색창에 키워드 입력\n2. 정렬 「인기순」 선택",
    body: "품절 상품이 인기순 상단에 그대로 노출됩니다. 고객이 눌러 들어가면 구매 버튼이 비활성입니다.",
    exp: "품절 상품은 기본적으로 뒤로 밀리거나 필터로 제외할 수 있어야 합니다." },
  { sys: "FR", t: "상품 상세 이미지가 가로 스크롤을 만듭니다 (모바일)",
    path: "1. 모바일에서 상품 상세 진입\n2. 상세 이미지 영역까지 스크롤",
    body: "상세 이미지 폭이 화면보다 넓어 좌우로 밀립니다. 폭이 390px 인 기기에서 재현됩니다.",
    exp: "이미지는 화면 폭에 맞게 줄어들어야 하고 가로 스크롤이 생기면 안 됩니다." },
  { sys: "FR", t: "리뷰 별점을 선택하지 않고 등록하면 0점으로 저장됩니다",
    path: "1. 구매 확정된 주문에서 리뷰 쓰기\n2. 별점을 누르지 않고 내용만 입력 후 등록",
    body: "별점 필수 안내가 뜨지 않고 그대로 등록되며, 목록에는 0점으로 집계됩니다.",
    exp: "별점은 필수값이며 선택 전에는 등록 버튼이 눌리지 않아야 합니다." },
  { sys: "FR", t: "비회원 주문 조회에서 주문번호만으로 남의 주문이 열립니다",
    path: "1. 비회원 주문 조회 진입\n2. 주문번호 입력, 이름·연락처는 임의값",
    body: "이름과 연락처가 달라도 주문번호가 맞으면 주문 상세가 열립니다.",
    exp: "주문번호 + 주문자 정보가 모두 일치할 때만 조회되어야 합니다." },
  { sys: "FR", t: "결제 실패 후 뒤로가기를 하면 같은 주문이 두 번 생성됩니다",
    path: "1. 결제 단계에서 실패 처리\n2. 브라우저 뒤로가기\n3. 다시 결제",
    body: "실패한 주문이 남아 있는 상태에서 재결제하면 주문이 2건 만들어집니다.",
    exp: "실패한 주문은 폐기되거나 같은 주문으로 이어져야 합니다." },
  { sys: "ST", t: "판매자 센터에서 상품 일괄 등록 시 3번째 행부터 누락됩니다",
    path: "1. 판매자 센터 > 상품 일괄 등록\n2. 10행짜리 엑셀 업로드",
    body: "10행을 올리면 2건만 등록되고 나머지는 결과 화면에 아무 표시 없이 사라집니다.",
    exp: "전건이 등록되거나, 실패한 행과 사유가 결과에 나와야 합니다." },
  { sys: "ST", t: "정산 내역 엑셀 다운로드가 빈 파일로 떨어집니다",
    path: "1. 판매자 센터 > 정산 > 기간 선택\n2. 엑셀 다운로드",
    body: "화면에는 42건이 보이는데 내려받은 파일에는 머리글만 있습니다.",
    exp: "화면에 보이는 조건 그대로 파일에도 담겨야 합니다." },
  { sys: "ST", t: "옵션 재고를 0으로 바꿔도 노출 상태가 판매중으로 남습니다",
    path: "1. 상품 수정 > 옵션 재고 0 저장\n2. 고객 프론트에서 해당 상품 확인",
    body: "재고가 0인데 판매중으로 보여 고객이 주문을 넣을 수 있습니다.",
    exp: "재고 0 이면 품절로 전환되어야 합니다." },
  { sys: "ST", t: "상품명에 이모지를 넣고 저장하면 500 오류가 납니다",
    path: "1. 상품 등록 > 상품명에 이모지 포함\n2. 저장",
    body: "저장 시 빈 500 화면으로 떨어지고 입력하던 내용이 전부 날아갑니다.",
    exp: "이모지도 저장되거나, 최소한 안내 문구와 함께 입력값이 보존되어야 합니다." },
  { sys: "ST", t: "주문 목록 필터를 걸고 페이지를 넘기면 필터가 풀립니다",
    path: "1. 주문 목록 > 상태 「배송중」 필터\n2. 2페이지로 이동",
    body: "2페이지로 넘어가는 순간 필터가 초기화되어 전체 목록이 나옵니다.",
    exp: "페이지를 넘겨도 조건이 유지되어야 하고 주소에도 남아야 합니다." },
  { sys: "ST", t: "송장번호를 붙여넣으면 앞뒤 공백 때문에 배송 추적이 실패합니다",
    path: "1. 주문 상세 > 송장번호 붙여넣기\n2. 저장 후 배송 추적",
    body: "엑셀에서 복사하면 공백이 함께 들어오는데 그대로 저장되어 추적이 실패합니다.",
    exp: "저장 시 앞뒤 공백을 걷어내야 합니다." },
  { sys: "AC", t: "입점사 승인 화면에서 반려 사유를 적지 않아도 반려됩니다",
    path: "1. 관리자 콘솔 > 입점 신청 > 반려\n2. 사유 미입력 후 확인",
    body: "사유 없이 반려되어 판매자는 왜 반려됐는지 알 수 없습니다.",
    exp: "반려는 사유가 필수여야 합니다." },
  { sys: "AC", t: "권한이 없는 계정으로 관리자 URL 을 직접 치면 화면이 열립니다",
    path: "1. 일반 운영자 계정으로 로그인\n2. 주소창에 /admin/settings 직접 입력",
    body: "메뉴에는 안 보이지만 주소를 직접 치면 설정 화면이 그대로 열립니다.",
    exp: "권한 검사는 화면이 아니라 서버에서 걸려야 합니다." },
  { sys: "AC", t: "통계 화면의 합계와 목록 건수가 다릅니다",
    path: "1. 관리자 콘솔 > 통계 > 기간 선택\n2. 숫자를 눌러 목록으로 이동",
    body: "통계에는 128건인데 눌러서 들어간 목록은 121건입니다.",
    exp: "화면의 숫자와 링크로 이동한 목록의 건수가 같아야 합니다." },
  { sys: "AC", t: "회원 검색에서 대소문자를 구분해 결과가 안 나옵니다",
    path: "1. 회원 관리 > 이메일로 검색\n2. 대문자로 입력",
    body: "소문자로 저장된 이메일이 대문자로 검색하면 0건으로 나옵니다.",
    exp: "이메일 검색은 대소문자를 가리지 않아야 합니다." },
  { sys: "AC", t: "공지사항 예약 발행 시각이 UTC 로 저장됩니다",
    path: "1. 공지 등록 > 예약 발행 09:00 지정\n2. 목록에서 확인",
    body: "09:00 으로 지정했는데 목록에는 18:00 으로 보입니다.",
    exp: "모든 시각은 한국 시간 기준으로 저장·표시되어야 합니다." },
  { sys: "AP", t: "앱에서 푸시를 누르면 홈으로만 이동합니다",
    path: "1. 주문 상태 변경 푸시 수신\n2. 푸시 탭",
    body: "해당 주문 상세로 가야 하는데 항상 홈 화면이 열립니다.",
    exp: "푸시에 담긴 대상 화면으로 바로 이동해야 합니다." },
  { sys: "AP", t: "앱 로그인 유지가 하루도 못 가고 풀립니다",
    path: "1. 로그인 유지 체크 후 로그인\n2. 다음 날 앱 실행",
    body: "로그인 유지를 켜 두어도 다음 날이면 로그인 화면이 뜹니다.",
    exp: "로그인 유지 기간은 정책대로 30일 동안 유지되어야 합니다." },
  { sys: "AP", t: "카메라 권한을 거부하면 앱이 종료됩니다",
    path: "1. 리뷰 사진 첨부 > 카메라 선택\n2. 권한 거부",
    body: "권한을 거부하는 즉시 앱이 강제 종료됩니다.",
    exp: "권한을 거부하면 안내 문구를 보여주고 이전 화면으로 돌아가야 합니다." },
  { sys: "AP", t: "다크 모드에서 버튼 글자가 배경과 같은 색으로 보입니다",
    path: "1. 시스템 다크 모드 켜기\n2. 주문 상세 진입",
    body: "「교환·반품 신청」 버튼의 글자와 배경 명암비가 낮아 거의 읽히지 않습니다.",
    exp: "다크 모드에서도 본문 대비 7:1 이상을 지켜야 합니다." },
  { sys: "ST", t: "반품 접수 후 재고가 두 번 늘어납니다",
    path: "1. 판매자 센터 > 반품 접수\n2. 수거 완료 처리",
    body: "반품 접수 시 한 번, 수거 완료 시 한 번 — 재고가 2 증가합니다.",
    exp: "재고는 수거 완료 시점에 한 번만 증가해야 합니다." },
  { sys: "ST", t: "판매자 비밀번호 변경 후에도 이전 비밀번호로 로그인됩니다",
    path: "1. 비밀번호 변경\n2. 다른 브라우저에서 이전 비밀번호로 로그인",
    body: "변경 후 10분 정도 이전 비밀번호가 그대로 통합니다.",
    exp: "변경 즉시 이전 비밀번호는 막혀야 하고 기존 세션도 끊겨야 합니다." },
  { sys: "ST", t: "상품 목록 페이지네이션이 마지막 페이지에서 멈추지 않습니다",
    path: "1. 상품 목록 마지막 페이지\n2. 다음 버튼 클릭",
    body: "다음 버튼이 계속 눌리고 빈 목록이 나옵니다.",
    exp: "마지막 페이지에서는 다음 버튼이 비활성이어야 합니다." },
  { sys: "AC", t: "엑셀 내보내기가 1,000건에서 잘립니다",
    path: "1. 주문 관리 > 전체 기간 > 엑셀",
    body: "3,200건을 조회한 뒤 내려받으면 1,000행까지만 들어 있습니다. 잘렸다는 안내도 없습니다.",
    exp: "전건이 내려가거나, 최소한 «1,000건까지만 받았습니다» 안내가 있어야 합니다." },
  { sys: "AC", t: "운영자 계정을 비활성해도 로그인한 세션은 살아 있습니다",
    path: "1. 운영자 계정 비활성\n2. 해당 계정이 열어 둔 탭에서 계속 조작",
    body: "비활성 처리 후에도 이미 로그인한 창에서는 계속 쓸 수 있습니다.",
    exp: "비활성 즉시 세션이 끊겨야 합니다." },
  { sys: "AC", t: "검색 조건을 지워도 목록이 이전 조건으로 남습니다",
    path: "1. 조건 입력 후 검색\n2. 조건 모두 지우고 다시 검색",
    body: "조건을 비우고 검색해도 직전 결과가 그대로 나옵니다.",
    exp: "조건을 비우면 전체 목록이 나와야 합니다." },
  { sys: "FR", t: "주소 검색 팝업이 모바일에서 닫히지 않습니다",
    path: "1. 모바일에서 배송지 추가\n2. 주소 검색 팝업 열기",
    body: "닫기 버튼이 화면 밖에 있어 뒤로가기로도 닫히지 않습니다.",
    exp: "팝업은 화면 안에 들어와야 하고 뒤로가기로도 닫혀야 합니다." },
  { sys: "FR", t: "포인트를 전액 사용하면 결제 수단 선택이 사라집니다",
    path: "1. 주문서 > 포인트 전액 사용\n2. 결제 진행",
    body: "결제 금액이 0원이 되면 결제 수단 영역이 통째로 없어지고 다음 단계로 못 갑니다.",
    exp: "0원 결제도 완료될 수 있어야 합니다." },
  { sys: "FR", t: "위시리스트에 담은 상품이 로그아웃하면 사라집니다",
    path: "1. 로그인 상태로 위시리스트 담기\n2. 로그아웃 후 재로그인",
    body: "재로그인하면 담아 둔 목록이 비어 있습니다.",
    exp: "회원 위시리스트는 계정에 저장되어야 합니다." },
  { sys: "FR", t: "상품 문의에 답변이 달려도 알림이 오지 않습니다",
    path: "1. 상품 문의 등록\n2. 판매자가 답변 등록",
    body: "답변이 달려도 고객에게 아무 알림이 없어 직접 들어와야 확인됩니다.",
    exp: "답변 시 알림이 가야 합니다." },
  { sys: "AP", t: "앱 첫 실행에서 스플래시가 5초 이상 멈춥니다",
    path: "1. 앱 삭제 후 재설치\n2. 첫 실행",
    body: "스플래시에서 5~8초 멈춥니다. 저사양 기기에서 더 깁니다.",
    exp: "2초 이내에 다음 화면으로 넘어가야 합니다." },
  { sys: "AP", t: "앱에서 쿠폰함을 열면 만료된 쿠폰이 먼저 보입니다",
    path: "1. 앱 > 마이 > 쿠폰함",
    body: "만료 쿠폰이 상단에, 쓸 수 있는 쿠폰이 아래에 있습니다.",
    exp: "사용 가능한 쿠폰이 먼저 보여야 합니다." },
  { sys: "AP", t: "글자 크기를 «아주 크게» 로 두면 버튼 글자가 잘립니다",
    path: "1. 시스템 글자 크기 최대\n2. 주문 상세 진입",
    body: "버튼 안의 글자가 «교환·반…» 처럼 잘립니다.",
    exp: "글자 크기를 키워도 내용이 잘리지 않아야 합니다." },
  { sys: "ST", t: "정산 금액이 원 단위에서 반올림돼 1원씩 어긋납니다",
    path: "1. 정산 상세 > 합계 확인",
    body: "건별 금액을 더한 값과 화면의 합계가 1~3원 차이 납니다.",
    exp: "반올림 기준을 한 곳으로 통일해야 합니다." },
  { sys: "AC", t: "배너 등록 시 이미지 용량 제한 안내가 없습니다",
    path: "1. 배너 관리 > 등록 > 5MB 이미지 선택",
    body: "업로드가 실패하는데 아무 안내가 없어 왜 안 되는지 알 수 없습니다.",
    exp: "제한 용량과 실패 사유를 알려 줘야 합니다." },
  { sys: "AP", t: "네트워크가 끊긴 상태에서 새로고침하면 흰 화면이 남습니다",
    path: "1. 비행기 모드\n2. 목록 당겨서 새로고침",
    body: "재시도 버튼 없이 흰 화면만 남아 앱을 껐다 켜야 합니다.",
    exp: "연결 실패 안내와 다시 시도 버튼이 보여야 합니다." },
];

const BOOK_ISSUES: Seed[] = [
  { sys: "BW", t: "지난 날짜가 예약 가능일로 선택됩니다",
    path: "1. 예약 웹 > 달력 열기\n2. 어제 날짜 클릭",
    body: "어제 날짜가 회색 처리되지 않고 선택되며 다음 단계로 넘어갑니다.",
    exp: "오늘 이전 날짜는 선택할 수 없어야 합니다." },
  { sys: "BW", t: "같은 시간대에 예약이 2건 잡힙니다",
    path: "1. 두 브라우저에서 같은 시간대 선택\n2. 동시에 예약 완료",
    body: "동시에 누르면 정원 1명인 시간대에 2건이 들어갑니다.",
    exp: "정원을 넘는 예약은 나중 것이 거절되어야 합니다." },
  { sys: "BW", t: "예약 취소 후에도 확인 메일이 계속 옵니다",
    path: "1. 예약 완료 > 취소\n2. 메일함 확인",
    body: "취소 뒤에도 하루 전 알림 메일이 발송됩니다.",
    exp: "취소된 예약은 알림 대상에서 빠져야 합니다." },
  { sys: "BA", t: "예약 목록 기간 검색이 시작일을 포함하지 않습니다",
    path: "1. 예약 어드민 > 기간 검색\n2. 시작일을 예약일과 같게 지정",
    body: "시작일 당일 예약이 결과에서 빠집니다.",
    exp: "시작일과 종료일 모두 포함되어야 합니다." },
  { sys: "BA", t: "운영시간을 저장해도 화면에 반영되지 않습니다",
    path: "1. 설정 > 운영시간 변경 후 저장\n2. 예약 웹에서 확인",
    body: "저장은 되는데 예약 웹에는 이전 시간대가 그대로 보입니다.",
    exp: "저장 즉시 예약 가능한 시간대에 반영되어야 합니다." },
  { sys: "BA", t: "예약자 연락처가 마스킹 없이 그대로 노출됩니다",
    path: "1. 예약 어드민 > 예약 상세",
    body: "휴대폰 번호 전체가 마스킹 없이 보입니다.",
    exp: "가운데 자리는 가려야 하고, 전체 보기는 권한이 있을 때만 가능해야 합니다." },
];

// ─────────────────────────────────────────────────────────────
// 6. 채워 넣기
// ─────────────────────────────────────────────────────────────

/** 상태 분포. 실제 QA 판에서 나오는 모양에 가깝게 — 미해결이 절반 남짓. */
const STATUS_MIX: string[] = [
  ...Array(13).fill("OPEN"),
  ...Array(7).fill("IN_PROGRESS"),
  ...Array(4).fill("MERGE_PENDING"),
  ...Array(3).fill("REOPENED"),
  ...Array(9).fill("FIXED"),
  ...Array(4).fill("ANSWERED"),
  ...Array(4).fill("MONITORING"),
  ...Array(14).fill("CLOSED"),
  ...Array(3).fill("DEMAND"),
];
const PRIORITY_MIX = ["CRITICAL", "MAJOR", "MAJOR", "NORMAL", "NORMAL", "NORMAL", "NORMAL", "MINOR"];
const REPRO_MIX = ["ALWAYS", "ALWAYS", "ALWAYS", "INTERMITTENT", "INTERMITTENT", "ONCE"] as const;
const VARIANTS = ["", " — AOS 에서도 재현됩니다", " — 2차 차수에서 다시 확인했습니다"];

/** 코멘트 재료. 누가 어떤 말을 하는지가 역할별로 달라야 화면이 거짓말을 하지 않는다. */
const DEV_LINES = [
  "확인했습니다. 서버에서 값을 검증하지 않고 화면에서만 막고 있었습니다. 수정하겠습니다.",
  "원인 파악됐습니다. 목록 조회 쿼리에 조건이 빠져 있었습니다.",
  "재현 안 되는데 어느 버전에서 보셨는지 알려주실 수 있을까요?",
  "다음 배포에 포함하겠습니다. 영향 범위는 해당 화면 한 곳입니다.",
  "수정 완료했습니다. Stage 에 올렸으니 확인 부탁드립니다.",
];
const QA_LINES = [
  "Stage 에서 재확인했습니다. 정상 동작합니다.",
  "같은 증상이 다른 화면에서도 보입니다. 함께 봐주셔야 할 것 같습니다.",
  "재현 조건 추가합니다 — 로그인하지 않은 상태에서만 발생합니다.",
  "화면 첨부했습니다. 3번 시도해 3번 모두 재현됩니다.",
  "수정 확인했습니다. 종결하겠습니다.",
];
const PLAN_LINES = [
  "기획 의도상 막는 게 맞습니다. 개발 쪽에서 반영 부탁드립니다.",
  "이 케이스는 정책이 정해져 있지 않습니다. 확인 후 회신드리겠습니다.",
  "문구는 「다시 시도해 주세요」 로 통일하겠습니다.",
];

async function main() {
  console.log("기존 데이터를 비웁니다…");
  await prisma.notification.deleteMany();
  await prisma.issueWatcher.deleteMany();
  await prisma.attachment.deleteMany();
  // 첨부의 «실물» 도 같이. IT_STORAGE=db 로 올린 것이 여기 남는다.
  await prisma.fileBlob.deleteMany();
  await prisma.issueHistory.deleteMany();
  // 대댓글이 부모를 참조한다. 답글부터 지워야 외래키가 걸리지 않는다.
  await prisma.comment.deleteMany({ where: { parentId: { not: null } } });
  await prisma.comment.deleteMany();
  await prisma.importedRow.deleteMany();
  await prisma.importedColumn.deleteMany();
  await prisma.importedList.deleteMany();
  await prisma.savedFilter.deleteMany();
  await prisma.issueTemplate.deleteMany();
  await prisma.issueRelation.deleteMany();
  await prisma.issuePlatform.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.statusTransition.deleteMany();
  await prisma.issueStatus.deleteMany();
  await prisma.priority.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.system.deleteMany();
  await prisma.platform.deleteMany();
  await prisma.round.deleteMany();
  await prisma.session.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  // ── 팀 · 사람
  const teamId = new Map<string, number>();
  for (const t of TEAMS) {
    const row = await prisma.team.create({ data: { ...t, isActive: true } });
    teamId.set(t.name, row.id);
  }
  const pwHash = await bcrypt.hash(DEMO_PW, 10);
  const userId = new Map<string, number>();
  for (const u of USERS) {
    const row = await prisma.user.create({
      data: {
        loginId: u.loginId, name: u.name,
        email: `${u.loginId}@example.com`,
        passwordHash: pwHash, systemRole: u.role,
        teamId: teamId.get(u.team)!, isActive: true,
      },
    });
    userId.set(u.loginId, row.id);
  }
  const qa = ["sr.jang", "hw.moon", "yb.seo", "demo"].map((l) => userId.get(l)!);
  const dev = ["jh.pyo", "db.ryu", "mj.sagong"].map((l) => userId.get(l)!);
  const planner = userId.get("ah.gu")!;
  const roleOf = new Map<number, "QA" | "DEV" | "PLANNER">();
  qa.forEach((id) => roleOf.set(id, "QA"));
  dev.forEach((id) => roleOf.set(id, "DEV"));
  roleOf.set(planner, "PLANNER");
  console.log(`팀 ${TEAMS.length} · 사용자 ${USERS.length}`);

  // ── 프로젝트마다
  let totalIssues = 0, totalComments = 0;
  for (const p of PROJECTS) {
    const project = await prisma.project.create({
      data: {
        key: p.key, issuePrefix: p.prefix, name: p.name, description: p.description,
        status: "ACTIVE", startedAt: p.rounds[0].startedOn,
      },
    });

    const { st, pr, env, plat } = await createMasters(prisma, project.id);
    const sys = new Map<string, number>();
    for (const [i, x] of p.systems.entries()) {
      const row = await prisma.system.create({ data: { projectId: project.id, ...x, sortOrder: i + 1 } });
      sys.set(x.code, row.id);
    }
    const rnds: { code: string; id: number }[] = [];
    for (const [i, x] of p.rounds.entries()) {
      const row = await prisma.round.create({ data: { projectId: project.id, ...x, sortOrder: i + 1 } });
      rnds.push({ code: x.code, id: row.id });
    }

    // ── 이슈
    const pool = p.key === "SHOP" ? SHOP_ISSUES : BOOK_ISSUES;
    const span = p.key === "SHOP" ? 45 : 20;
    for (let n = 0; n < p.issueCount; n++) {
      const base = pool[n % pool.length];
      const variant = VARIANTS[Math.floor(n / pool.length) % VARIANTS.length];
      const statusCode = STATUS_MIX[n % STATUS_MIX.length];
      const status = STATUSES.find((s) => s.code === statusCode)!;
      const reporter = pick(qa);
      /**
       * 담당자. 보통은 개발이지만 둘은 다르다 —
       * `Demand` 는 **기획에게 묻는 것**이고, `Monitoring` 은
       * **QA 가 다음 차수에 다시 보는 것**이다. 전부 개발에게 몰아 두면
       * 대시보드의 «내가 맡은 것» 이 QA 에게 영영 0 이 된다.
       */
      const assignee =
        statusCode === "DEMAND" ? planner
        : statusCode === "MONITORING" ? pick(qa)
        : pick(dev);
      const openDay = span - Math.floor((n / p.issueCount) * (span - 1));
      const reportedAt = daysAgo(openDay, int(9, 18), int(0, 59));
      const closedish = ["FIXED", "CLOSED", "ANSWERED", "MONITORING"].includes(statusCode);
      const statusChangedAt = closedish
        ? daysAgo(Math.max(0, openDay - int(1, 5)), int(9, 18), int(0, 59))
        : reportedAt;
      const round = rnds[openDay > span / 2 ? 0 : rnds.length - 1];

      const issue = await prisma.issue.create({
        data: {
          projectId: project.id, seq: n + 1,
          title: (base.t + variant).slice(0, 200),
          content: base.body, testPath: base.path, expected: base.exp,
          legacyScreenName: null,
          priorityId: pr.get(PRIORITY_MIX[n % PRIORITY_MIX.length])!,
          environmentId: env.get(n % 3 === 0 ? "DEV" : "STAGE")!,
          systemId: sys.get(base.sys)!,
          statusId: st.get(statusCode)!,
          reproRate: REPRO_MIX[n % REPRO_MIX.length],
          reporterId: reporter,
          assigneeId: statusCode === "OPEN" && n % 4 === 0 ? null : assignee,
          roundId: round.id,
          foundVersion: `v1.${round.code === "R1" ? 2 : 3}.${int(0, 9)}`,
          fixedVersion: status.category === "RESOLVED" || status.category === "CLOSED" ? `v1.3.${int(1, 9)}` : null,
          reportedAt, statusChangedAt,
          resolvedAt: closedish ? statusChangedAt : null,
          closeReason: statusCode === "CLOSED"
            ? (["QA_CONFIRMED", "QA_CONFIRMED", "QA_CONFIRMED", "NOT_AN_ISSUE", "DUPLICATE", "ON_HOLD"] as const)[n % 6]
            : null,
          answeredById: statusCode === "ANSWERED" ? planner : null,
          answeredByRole: statusCode === "ANSWERED" ? "PLANNER" : null,
          answeredAt: statusCode === "ANSWERED" ? statusChangedAt : null,
          createdAt: reportedAt,
        },
      });
      totalIssues++;

      // 플랫폼 (1~2개)
      const platCodes = base.sys === "AP" ? ["AOS", "IOS"] : n % 5 === 0 ? ["PC", "AOS"] : ["PC"];
      await prisma.issuePlatform.createMany({
        data: platCodes.map((c) => ({ issueId: issue.id, platformId: plat.get(c)! })),
      });

      // 구독 — 보고자와 담당자는 자동으로 붙는다
      const watchers = [...new Set([reporter, issue.assigneeId].filter(Boolean) as number[])];
      await prisma.issueWatcher.createMany({
        data: watchers.map((u) => ({ issueId: issue.id, userId: u, createdAt: reportedAt })),
      });

      // 변경 이력 — 상태가 움직인 이슈만
      if (statusCode !== "OPEN") {
        const mover = status.category === "OPEN" ? pick(dev) : pick(qa);
        await prisma.issueHistory.create({
          data: {
            issueId: issue.id, field: "status",
            oldValue: "Open", newValue: status.name,
            changedById: mover, changedByRole: roleOf.get(mover) ?? null,
            note: statusCode === "MONITORING"
              ? "Stage v1.3 에서 5회 시도했으나 재현되지 않았습니다. 다음 차수에 같은 경로로 다시 확인합니다."
              : statusCode === "FIXED" ? "원인은 서버 검증 누락. 해당 화면 한 곳만 영향받습니다."
              : statusCode === "CLOSED" ? "Stage v1.3 에서 확인 완료했습니다."
              : null,
            changedAt: statusChangedAt,
          },
        });
      }

      // 코멘트 (0~3) — 몇 건은 답글까지
      const cn = n % 7 === 0 ? 0 : int(1, 3);
      let lastRoot: number | null = null;
      for (let c = 0; c < cn; c++) {
        const isDev = c % 2 === 0;
        const author = statusCode === "DEMAND" && c === 0 ? planner : isDev ? pick(dev) : pick(qa);
        const type = author === planner ? "PLAN" : isDev ? "DEV" : "QA";
        const body = type === "PLAN" ? pick(PLAN_LINES) : isDev ? pick(DEV_LINES) : pick(QA_LINES);
        // 코멘트 시각은 **업무 시간 안**으로 떨어뜨린다.
        // 그냥 «등록 + n시간» 으로 두면 새벽 3시에 달린 코멘트가 나와서,
        // 보는 사람이 제일 먼저 «이거 진짜 데이터인가» 를 의심하게 된다.
        const at = (() => {
          const d = new Date(reportedAt);
          d.setDate(d.getDate() + c);
          d.setHours(int(9, 19), int(0, 59), 0, 0);
          return d;
        })();
        const row = await prisma.comment.create({
          data: { issueId: issue.id, type, authorId: author, body, createdAt: at > new Date() ? new Date() : at },
        });
        totalComments++;
        if (c === 0) lastRoot = row.id;
        else if (c === 2 && lastRoot) {
          await prisma.comment.create({
            data: {
              issueId: issue.id, type: "QA", authorId: reporter, parentId: lastRoot,
              body: "@" + USERS.find((u) => userId.get(u.loginId) === author)!.name + " 확인했습니다. 재현 경로 다시 올려둘게요.",
              createdAt: new Date(row.createdAt.getTime() + 3600_000),
            },
          });
          totalComments++;
        }
      }
    }
    /**
     * ★ **`updated_at` 을 되돌린다.**
     *
     *   `@updatedAt` 은 Prisma 가 «지금» 으로 덮어쓴다. 그래서 시드가 끝나면
     *   **78건의 수정일이 전부 같은 시각**이 된다 — 목록의 `수정일` 열이 한 덩어리로 보이고,
     *   «최근 바뀐 것» 이라는 개념이 화면에서 사라진다.
     *   `create` 로는 못 막으므로 다 넣은 뒤 SQL 로 한 번에 되돌린다.
     */
    await prisma.$executeRawUnsafe(
      `UPDATE issues SET updated_at = GREATEST(reported_at, status_changed_at) WHERE project_id = ${project.id}`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE comments c JOIN issues i ON i.id = c.issue_id SET c.updated_at = c.created_at WHERE i.project_id = ${project.id}`,
    );

    await prisma.project.update({ where: { id: project.id }, data: { issueSeq: p.issueCount } });
    console.log(`프로젝트 ${p.key} — 이슈 ${p.issueCount}`);

    // ── 저장된 필터 · 템플릿 (SHOP 에만)
    if (p.key === "SHOP") {
      await prisma.savedFilter.createMany({
        data: [
          { projectId: project.id, ownerId: userId.get("demo")!, name: "내가 볼 미해결", query: "status=OPEN&status=IN_PROGRESS&status=REOPENED", isShared: true },
          { projectId: project.id, ownerId: userId.get("demo")!, name: "Critical 만", query: "priority=CRITICAL", isShared: true },
          { projectId: project.id, ownerId: userId.get("sr.jang")!, name: "2차 차수 결과", query: `round=R2`, isShared: false },
        ],
      });
      await prisma.issueTemplate.createMany({
        data: [
          {
            projectId: project.id, name: "고객 프론트 — 주문/결제",
            testPath: "1. 고객 프론트 로그인\n2. \n3. ",
            expected: "", screenName: "주문서",
            systemId: sys.get("FR")!, priorityId: pr.get("MAJOR")!, environmentId: env.get("STAGE")!,
            roundId: rnds[rnds.length - 1].id, platformCodes: ["PC"], sortOrder: 1,
          },
          {
            projectId: project.id, name: "고객 앱 — 공통",
            testPath: "1. 앱 실행 후 로그인\n2. \n3. ",
            expected: "", screenName: "",
            systemId: sys.get("AP")!, priorityId: pr.get("NORMAL")!, environmentId: env.get("STAGE")!,
            roundId: rnds[rnds.length - 1].id, platformCodes: ["AOS", "IOS"], sortOrder: 2,
          },
        ],
      });
    }
  }

  // ── 알림 — 데모 계정으로 로그인하면 종이 울려 있어야 «앱이 살아 있다»는 게 보인다
  const demoId = userId.get("demo")!;
  const recent = await prisma.issue.findMany({
    where: { reporterId: { not: demoId } }, orderBy: { id: "desc" }, take: 5,
    include: { project: true },
  });
  for (const [i, iss] of recent.entries()) {
    await prisma.notification.create({
      data: {
        userId: demoId, actorId: iss.reporterId, issueId: iss.id,
        kind: (["COMMENT", "STATUS", "ASSIGNED", "MENTION", "CLOSED"] as const)[i % 5],
        title: iss.title.slice(0, 200),
        href: `/p/${iss.project.key}/issues/${iss.seq}`,
        readAt: i < 3 ? null : new Date(),
        createdAt: daysAgo(i, 14, 0),
      },
    });
  }

  console.log(`\n완료 — 이슈 ${totalIssues} · 코멘트 ${totalComments}`);
  console.log(`데모 계정: demo / ${DEMO_PW} (관리자)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
