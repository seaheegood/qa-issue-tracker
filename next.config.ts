import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * ★ **서버 액션 본문 상한. 기본값이 1MB 다.**
       *
       * 앱이 정한 파일 상한은 `src/lib/storage.ts` 의 `MAX_BYTES` = **10MB** 인데,
       * 그 검사는 서버 액션 **안에서** 돈다. 1MB 를 넘으면 Next 가 액션을 부르기도 전에
       * 413 으로 끊어서, 사용자에게는 *"파일이 너무 큽니다"* 대신 **빈 500** 이 뜬다.
       *
       * ⚠️ 이건 임포트만의 문제가 아니었다 — **첨부파일도 같은 길을 탄다.**
       *   1MB 넘는 스크린샷을 붙이면 조용히 실패하고 있었다는 뜻이다.
       *   (2026-08-31, 3.69MB 짜리 고객사 엑셀을 올리다가 드러났다)
       *
       * 12MB 로 둔 이유: 상한이 10MB 인데 `multipart/form-data` 는 경계 문자열·
       * 파트 헤더로 몇십 KB 를 더 쓴다. 딱 맞춰 두면 **10MB 짜리 정상 파일이 걸린다.**
       */
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
