const js = require("@eslint/js");
const tsESLint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        NodeJS: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tsESLint,
    },
    rules: {
      ...tsESLint.configs.recommended.rules,
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-undef": "warn",
    },
  },
];
