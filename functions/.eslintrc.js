module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
  },

  overrides: [
    // ✅ שכבת תשתית: shared/import + zipSelect
    {
      files: ["src/shared/import/**/*.ts", "src/shared/zipSelect.ts"],
      rules: {
        "require-jsdoc": "off",
        "valid-jsdoc": "off",
        "max-len": [
          "warn",
          {
            code: 120,
            ignoreStrings: true,
            ignoreTemplateLiterals: true,
            ignoreRegExpLiterals: true,
          },
        ],
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },

    // ✅ טריגרים + index: לא לחסום דיפלוי בגלל JSDoc / שורות ארוכות / any
    {
      files: ["src/triggers/**/*.ts", "src/index.ts"],
      rules: {
        "require-jsdoc": "off",
        "valid-jsdoc": "off",
        "max-len": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "no-empty": "off",
      },
    },
  ],
};
