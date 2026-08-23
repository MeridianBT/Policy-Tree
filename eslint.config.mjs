/**
 * Flat config (ESLint 9). Three layers, narrowest last.
 *
 * The point of linting here is to catch the mistakes types cannot: a React
 * hook called conditionally, a promise dropped on the floor in a server
 * action, an unused export left behind by a refactor. Stylistic rules are
 * deliberately absent — this codebase has a consistent voice already, and a
 * formatter argument in review is worth less than the time it costs.
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default tseslint.config(
  {
    // Generated or built output. `generated/` is the Prisma client, which is
    // machine-written TypeScript and not ours to lint.
    ignores: [
      "generated/**",
      ".next/**",
      "node_modules/**",
      "backups/**",
      "next-env.d.ts",
      "eslint.config.mjs",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // An unused name is usually a leftover. A leading underscore is the
      // documented way to say "deliberately ignored" — a caught error that
      // genuinely has nothing to add, a positional argument being skipped.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // `any` defeats the reason this is a TypeScript codebase. Warn rather
      // than error where it is genuinely unavoidable at a library boundary.
      "@typescript-eslint/no-explicit-any": "warn",
      // Every mutation here is async and most return a result worth checking;
      // a dropped promise is a write that silently did not happen.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  {
    // A plain CommonJS Node script, not part of the bundle: it drives a real
    // browser to check the evaluation glyphs render on a target platform.
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },

  {
    // Scripts are operator tools run from a terminal. Printing is the output.
    files: ["scripts/**/*.ts", "prisma/seed.ts", "prisma/seed-data.ts"],
    rules: { "no-console": "off" },
  },

  {
    // Tests assert; they do not need the production hygiene rules.
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: { "no-console": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
);
