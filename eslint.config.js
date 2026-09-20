const js = require("@eslint/js");
const globals = require("globals");

/**
 * Lint rules for a CommonJS Node service.
 *
 * Deliberately narrow: this is a correctness gate for CI, not a style police.
 * Formatting opinions do not belong in a build that can block a merge.
 */
module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Express error middleware must declare four parameters to be recognised
      // as error middleware, even though `next` goes unused. Same for handlers
      // that accept `next` for signature consistency.
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_|^next$|^req$|^res$",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_|^error$",
        },
      ],

      // A promise returned and forgotten inside a request handler is how
      // "it worked locally" bugs get to production.
      "no-async-promise-executor": "error",
      "require-atomic-updates": "off",

      "no-console": "off", // structured logging is a later task

      // Escaping `-` and `.` inside a regex character class is redundant but
      // harmless, and often clearer about intent. Auto-"fixing" live regexes
      // (slug generation, email matching) risks changing what they match for
      // no benefit, so this stays off rather than being silenced per-line.
      "no-useless-escape": "off",

      // Would require attaching { cause } to every rethrow. Worth adopting,
      // but as a deliberate pass over the error handling - not as a gate that
      // fails the build on day one.
      "preserve-caught-error": "off",
    },
  },

  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
];
