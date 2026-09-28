import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  /**
   * 검증 스크립트는 **앱이 아니라 도구**다.
   *
   * ★ `node scripts/browser_test.js` 로 직접 실행하는 CommonJS 파일이라
   *   `require()` 가 맞다. 앱 규칙(ESM)을 그대로 적용하면 고칠 이유가 없는
   *   오류 5건이 계속 뜨고, 그러면 `npm run lint` 를 아무도 안 본다.
   *
   * ⚠️ **끄는 규칙을 여기 한 곳에만 적는다.** 파일마다 `eslint-disable` 을 뿌리면
   *   나중에 왜 껐는지 아무도 모른다.
   */
  {
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
