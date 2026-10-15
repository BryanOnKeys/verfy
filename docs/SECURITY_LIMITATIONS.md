# Security limitations

Verfy reduces risk; it does not remove it. These are the limits we know about. Nothing in the product, the site or these docs claims otherwise.

## The guard

- Rules are deterministic pattern matching over commands, paths, URLs and arguments. They are not a sandbox and cannot understand every possible shell construct, interpreter or obfuscation. Run untrusted code in a container or VM as well.
- Verfy only sees calls that go through its Claude Code hook or its MCP gateway. Tools an agent reaches another way are not checked.
- The hook answers deny or ask, never allow; Claude Code's own permission settings still decide allowed actions.
- Anyone with write access to the developer's machine can remove the hook or edit the policy. Team policy and receipts make that visible, not impossible.

## The scanner and locks

- A clean scan is not a security certification. The scanner finds known warning signs in tool definitions and configs.
- `verfy scan --discover` is static and does not start servers. `--live` starts each configured stdio server to list its tools; only use it for servers you would run anyway.
- The first time a server is seen, its tools are locked as they are (trust on first use).
- A lock proves a definition did not change since it was approved, not that it is safe.

## Receipts

- A receipt proves the decision Verfy made, the hashes of arguments and results, and that the record was not changed afterwards. It does not prove what a tool did internally.
- A device key proves which device signed, not that the device was uncompromised.
- Whoever holds a device's private key can build a new chain from scratch and sign it, and `verfy verify` will accept that chain on its own: the check catches edits, deletions and reordering inside a chain, not a complete replacement. Receipts already synced to Verfy Team cannot be replaced this way, because the server keeps the hash of every stored receipt and refuses different content for the same position (`chain_conflict`). A ledger that was never synced has no outside copy to compare with.
- Deleting an entire local ledger together with its key is not detectable locally; it is detectable when the device had already synced to Verfy Team.
- There is no external timestamping or transparency-log anchoring yet (Phase 2), so receipts show order, not trusted wall-clock time.

## Verfy Team

- Row-level security and server checks are tested on every build against the real migrations, but not yet reviewed by an independent penetration test.
- A database superuser (Supabase project owner) can technically alter data by disabling triggers. The audit log is hash-chained so silent edits are detectable when compared with an earlier copy or export, but it is not externally anchored.
- No software can promise to be unbreakable, and Verfy does not. It stacks independent layers so that one mistake is not enough: edge firewall, the in-app shield, Postgres rate limits, row-level security, two-factor authentication enforced in the database, append-only evidence.
- The shield's flood limits are per server instance (in memory); the limits that hold across all instances are the Postgres ones. Volumetric DDoS protection comes from Vercel's network; the WAF rules, bot protection and Attack Challenge Mode in `deploy/vercel/README.md` must be turned on by you in the Vercel dashboard.
- Two-factor authentication is opt-in per user. Accounts without it are protected by their password (at least 12 characters), the per-account limits and, if configured, the CAPTCHA.
- The CAPTCHA is optional and only effective when both the Turnstile site key (Vercel) and secret key (Supabase) are configured.
- `TRACE` requests are refused by Next.js itself with a generic error page before any Verfy code runs; deny them at the edge (rule 1 in `deploy/vercel/README.md`).
- Exports are limited to 20,000 receipts per request; there is no background job queue yet.
- Invitations are links you share yourself; Verfy sends no email of its own (Supabase Auth sends sign-up and reset emails).
- Policy regexes are checked for nested quantifiers, but regular expressions can still be slow on adversarial input on developer machines.

## What we do not do

No language model takes part in verdicts or verification. No "100% secure", "hacker-proof" or "guaranteed" claims. No certification, insurance or guarantee products exist in this release.
