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
    "no-else-return": "error",

    /* memory safety additions */

    /* prevent accidental globals */
    "no-implicit-globals": "error",
    "no-global-assign": "error",

    /* prevent listener leaks */
    "no-loop-func": "error",

    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.property.name='addEventListener'] > :nth-child(2):not(Identifier)",
        "message": "addEventListener must use a named function so it can be removed"
      },
      {
        "selector": "CallExpression[callee.property.name='removeEventListener'] > :nth-child(2):not(Identifier)",
        "message": "removeEventListener must use the same named function reference"
      },
      {
        "selector": "NewExpression[callee.name='MutationObserver']",
        "message": "Ensure MutationObserver.disconnect() is called"
      },
      {
        "selector": "NewExpression[callee.name='PerformanceObserver']",
        "message": "Ensure PerformanceObserver.disconnect() is called"
      }
    ],

    /* timers */
    "no-restricted-globals": [
      "error",
      {
        "name": "setInterval",
        "message": "Ensure intervals are cleared with clearInterval"
      }
    ]
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
