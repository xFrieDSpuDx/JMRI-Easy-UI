// web/eslint.config.mjs
import globals from "globals";
import eslintJs from "@eslint/js";
import pluginImport from "eslint-plugin-import";
import pluginN from "eslint-plugin-n";
import pluginJsdoc from "eslint-plugin-jsdoc";

export default [
  // Root ignores (instead of .eslintignore)
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".vite/**",
      // generated or legacy
      "**/*.min.js",
    ],
  },

  // Browser app code
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      import: pluginImport,
      n: pluginN,
      jsdoc: pluginJsdoc,
    },
    rules: {
      // Style & readability
      quotes: ["error", "double", { avoidEscape: true }],
      semi: ["error", "always"],
      "semi-spacing": "error",
      "semi-style": ["error", "last"],
      "no-trailing-spaces": "error",
      "comma-dangle": ["error", "only-multiline"],
      "comma-spacing": ["error", { before: false, after: true }],
      "object-curly-spacing": ["error", "always"],
      "array-bracket-spacing": ["error", "never"],

      // Naming / clarity
      camelcase: ["error", { properties: "always", ignoreDestructuring: false }],
      // Min name length 3, but allow common short terms:
      "id-length": ["error", {
        min: 3,
        exceptions: ["id", "el", "ok", "i", "x", "y", "fn"], // adjust as needed
        properties: "never",
      }],

      // Best practices
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "consistent-return": "error",
      "no-redeclare": "error",

      // Imports / Node usage in scripts
      "import/no-duplicates": "error",
      "import/order": ["error", {
        groups: [["builtin", "external", "internal"], ["parent", "sibling", "index"]],
        "newlines-between": "always",
      }],
      "n/no-missing-import": "off", // your project mixes CDN/ESM; turn on if everything is local
      "n/no-process-exit": "error",

      // JSDoc (function blocks)
      "jsdoc/require-jsdoc": ["warn", {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
      }],
      "jsdoc/require-param": "warn",
      "jsdoc/require-returns": "warn",
      "jsdoc/check-tag-names": "warn",
      "jsdoc/check-types": "warn",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",
    },
  },

  // Node-only scripts (e.g., web/scripts/*.mjs)
  {
    files: ["scripts/**/*.mjs", "esbuild.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "n/no-process-exit": "off",
    },
  },

  // Recommended core ESLint rules for JS
  eslintJs.configs.recommended,
];
