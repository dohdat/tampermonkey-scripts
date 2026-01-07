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
  extends: ["eslint:recommended"]
};
