import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, next, react],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Vendored shadcn/Blode UI primitives follow upstream conventions.
    "components/ui/**",
    // Build-time art generator, not shipped app code.
    "scripts/**",
  ],
  // Scoped to the one file that needs it, rather than switching a real rule
  // off across the whole app.
  overrides: [
    {
      files: ["app/page.tsx"],
      // The JSON-LD block is a static object literal with no user input, and
      // injecting an ld+json script this way is the documented Next pattern.
      rules: { "no-danger": "off" },
    },
  ],
  rules: {
    // Stylistic-only rules that fight idiomatic React + Phaser code:
    // `export function Component()`, PascalCase component files, hoisted
    // helper components, and inline unit annotations (`= 70; // deg/s`).
    // All bug-catching rules (unused vars, complexity, hooks, security,
    // no-any) stay on.
    "func-style": "off",
    "jsx-a11y/prefer-tag-over-role": "off",
    "nextjs/no-img-element": "off",
    "no-inline-comments": "off",
    "no-use-before-define": "off",
    "react/react-compiler": "off",
    "unicorn/filename-case": "off",
    "unicorn/prefer-single-call": "off",
  },
});
