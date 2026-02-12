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
    "/lib/**/*", // Ignore built files
    "/generated/**/*", // Ignore generated files
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],

  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],

    // ✅ Windows: אל תחסום דיפלוי בגלל CRLF
    "linebreak-style": "off",

    // ✅ התאמה ל-google style (בלי רווחים בתוך {})
    "object-curly-spacing": ["error", "never"],
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

    // ✅ כל קבצי ה-src (כולל mintCustomToken וכו׳)
    {
      files: ["src/**/*.ts"],
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
