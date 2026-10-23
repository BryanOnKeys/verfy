/** Choices on the Verfy Cloud waitlist form. The database checks the same values (migration 20261023000100_waitlist). */
export const WAITLIST_AGENTS = [
  ["claude-code", "Claude Code"],
  ["cursor", "Cursor"],
  ["claude-desktop", "Claude Desktop"],
  ["codex", "Codex"],
  ["copilot", "GitHub Copilot"],
  ["windsurf", "Windsurf"],
  ["own-agent", "Our own agent"],
  ["other", "Something else"],
] as const;

export const TEAM_SIZES = ["1", "2-10", "11-50", "51-200", "200+"] as const;

export type WaitlistAgent = (typeof WAITLIST_AGENTS)[number][0];
