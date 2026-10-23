/**
 * What Verfy sees in each agent. Kept in one place so the home page and the docs say the same thing; change it only
 * together with the hook (verfy-cli/src/verfy/hook.py) and the gateway (gateway.py).
 */
const AGENTS: { agent: string; how: string; setup: string; checks: string; misses: string }[] = [
  {
    agent: "Claude Code",
    how: "Hook (PreToolUse)",
    setup: "verfy hook install --write",
    checks: "Every tool call: shell commands, file reads and writes, web fetches and MCP tools",
    misses: "What a program started by an allowed command does afterwards",
  },
  {
    agent: "Cursor",
    how: "MCP gateway",
    setup: "verfy wrap ~/.cursor/mcp.json --write",
    checks: "MCP tool calls, and each server's tool definitions (scan and lock)",
    misses: "Cursor's own terminal, file edits and web search",
  },
  {
    agent: "Claude Desktop",
    how: "MCP gateway",
    setup: "verfy wrap claude_desktop_config.json --write",
    checks: "MCP tool calls, and each server's tool definitions (scan and lock)",
    misses: "Anything that does not go through an MCP server",
  },
  {
    agent: "VS Code, Windsurf, other MCP clients",
    how: "MCP gateway",
    setup: "verfy proxy --name NAME -- SERVER COMMAND",
    checks: "MCP tool calls through local (stdio) servers",
    misses: "The client's built-in tools, and remote (HTTP) MCP servers for now",
  },
  {
    agent: "CI (GitHub Actions)",
    how: "Lock check",
    setup: "verfy lock check, or the GitHub Action",
    checks: "The tool definitions of the servers in .mcp.json, against verfy.lock",
    misses: "No agent runs here, so there are no tool calls to check",
  },
];

export function AgentCoverage() {
  return (
    <div className="glass table-wrap">
      <table className="table">
        <caption className="visually-hidden">What Verfy checks in each agent</caption>
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">How Verfy connects</th>
            <th scope="col">What it checks</th>
            <th scope="col">What it does not see</th>
          </tr>
        </thead>
        <tbody>
          {AGENTS.map((a) => (
            <tr key={a.agent}>
              <th scope="row">{a.agent}</th>
              <td>
                <div>{a.how}</div>
                <code className="mono small muted">{a.setup}</code>
              </td>
              <td className="text-2">{a.checks}</td>
              <td className="small muted">{a.misses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
