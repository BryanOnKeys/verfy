# Contributing to Verfy

Thanks for helping. Verfy is a security tool, so the bar is: every rule is tested, nothing claims more than it does, and errors never turn into "allow".

## Found a way past Verfy?

A command, path, URL or tool call that Verfy should deny or ask about but allows is a **bypass**, and we treat it as a vulnerability. Please report it privately through [GitHub's private vulnerability reporting](https://github.com/anvarbekovjavohir277-dot/verfy/security/advisories/new), not in a public issue. Include:

- the exact tool call or command (for Claude Code, the `tool_name` and `tool_input` it sends),
- what `verfy check` answered (`verfy check "..."` or `verfy check --tool NAME --args JSON`) and what you expected,
- your OS and `verfy --version`.

Known limits that are not bypasses are listed in [`docs/SECURITY_LIMITATIONS.md`](docs/SECURITY_LIMITATIONS.md) (for example, a script the agent writes to a file and then runs). Ideas for closing them are welcome as issues.

## Other bugs and ideas

Open an issue. For a false positive (Verfy blocks something harmless), include the command and the rule ID it printed.

## Changing the code

```bash
# CLI (no dependencies)
cd verfy-cli && python -m unittest discover -s tests

# web app, database tests and the JavaScript engine
npm ci && npm run lint && npm run typecheck && npx vitest run
```

- **Rules live in data.** Patterns are in `verfy-cli/src/verfy/data/*.json`; the Python engine (`precheck.py`) and its JavaScript twin (`src/core/engine/verfy-engine.mjs`) must give the same answers. After a deliberate rule change, add cases to `verfy-cli/tests/make_fixtures.py`, run it, review the diff of `tests/fixtures/precheck.json`, and run `node verfy-cli/tests/test_engine.mjs`.
- **No AI decides a verdict.** Rules are deterministic; a pull request that asks a language model whether something is allowed will not be merged.
- **Fail closed.** Any error in the hook or gateway must end in `ask` or `deny`.
- **Database changes** are new files in `supabase/migrations/`, forward-only, with tests in `supabase/tests/`.
- **Say what is true.** Docs and the website describe what the code does today; anything planned is labelled as planned.

By contributing you agree that your contribution is released under the [MIT license](LICENSE).
