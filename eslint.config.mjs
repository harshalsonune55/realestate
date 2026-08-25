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
    // Generated, vendored or non-TypeScript output. `npm run lint` runs bare
    // `eslint` with no path, so without these it walks the Flutter app's build
    // output and reports tens of thousands of problems in code nobody wrote —
    // which buries the real ones in src/.
    "mobile/build/**",
    "mobile/.dart_tool/**",
    "mobile/ios/**",
    "mobile/android/**",
    "mobile/windows/**",
    "mobile/linux/**",
    "mobile/macos/**",
    "node_modules/**",
    "coverage/**",
    ".data/**",
  ]),
]);

export default eslintConfig;
