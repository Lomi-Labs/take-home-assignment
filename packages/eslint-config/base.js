import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Shared rules for every TypeScript package. Prettier owns formatting, so its config goes last. */
export const base = defineConfig([
    globalIgnores(["**/dist/**", "**/coverage/**", "**/.turbo/**"]),
    js.configs.recommended,
    ...tseslint.configs.strict,
    {
        languageOptions: { globals: { ...globals.node } },
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-console": "error",
        },
    },
    prettier,
]);

/** Backend packages: named exports only (tool config files at the package root need default exports). */
export const node = defineConfig([
    ...base,
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                { selector: "ExportDefaultDeclaration", message: "Use named exports in backend code." },
            ],
        },
    },
]);
