import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import eslintReact from "@eslint-react/eslint-plugin";

// Single flat config for the whole npm-workspaces monorepo (run via `npm run lint`).
// - Next.js + React rules apply only to the controller (the only web/JSX package).
// - TypeScript rules apply to every package.
// Composed from the plugins directly (eslint-config-next pulls in plugins that
// don't support ESLint 10 yet).
const CONTROLLER = ["packages/controller/**/*.{ts,tsx}"];

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Prisma's generated client is not ours to lint.
    "packages/controller/src/generated/**",
  ]),

  // TypeScript rules — all packages.
  { files: ["**/*.{ts,tsx}"], extends: [tseslint.configs.recommended] },

  // Next.js / React rules — controller only.
  {
    files: CONTROLLER,
    plugins: { "@next/next": nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs["core-web-vitals"].rules },
    // The Next.js plugin lives under packages/controller in this monorepo.
    settings: { next: { rootDir: "packages/controller" } },
  },
  { files: CONTROLLER, extends: [reactHooks.configs.flat.recommended] },
  { files: CONTROLLER, extends: [eslintReact.configs["recommended-typescript"]] },

  // Project rule tweaks.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Allow intentionally-unused bindings prefixed with `_`
      // (e.g. `const { db: _omitDb, ...rest } = resource`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // React Compiler rules (react-hooks v6+): they misfire on server components
      // (`Date.now()` during render) and on the idiomatic "mounted" effect
      // pattern. Off until we adopt the compiler.
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "@eslint-react/set-state-in-effect": "off",
    },
  },
]);
