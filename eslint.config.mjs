import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "verfy-cli/**", "next-env.d.ts", "src/core/engine/verfy-engine.mjs", "coverage/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env'] > Identifier[name=/^NEXT_PUBLIC_.*SECRET/]",
          message: "Secrets must never use the NEXT_PUBLIC_ prefix.",
        },
      ],
    },
  },
];

export default config;
