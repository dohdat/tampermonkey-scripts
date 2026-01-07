module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true,
    mocha: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module"
  },
  globals: {
    chrome: "readonly"
  },
  extends: ["eslint:recommended"],
  rules: {
    "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": [
      "error",
      { max: 80, skipBlankLines: true, skipComments: true }
    ],
    "max-depth": ["error", 4],
    "complexity": ["error", 10],
    "no-nested-ternary": "error",
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"],
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "consistent-return": "error",
    "no-else-return": "error"
  },
  overrides: [
    {
      files: ["**/*.test.js", "**/*.spec.js", "**/test.js"],
      rules: {
        "max-lines": "off",
        "max-lines-per-function": "off",
        "max-depth": "off",
        "complexity": "off",
        "consistent-return": "off",
        "no-else-return": "off"
      }
    }
  ]
};
