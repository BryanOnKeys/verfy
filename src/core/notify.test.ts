import { describe, expect, it, vi } from "vitest";
import { deliver, DeliveryError, messages, slackSafe } from "./notify";

const SLACK = "https://hooks.slack.com/services/T000/B000/" + "x".repeat(24);
const TOKEN = "123456789:" + "A".repeat(35);

function okFetch() {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response("ok", { status: 200 }));
}

describe("notifications", () => {
  it("posts to the Slack webhook, with mentions and links neutralised", async () => {
    const f = okFetch();
    await deliver("slack", SLACK, "Verfy: <!channel> on <http://evil|x> & co", f);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(SLACK);
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string).text).toBe("Verfy: &lt;!channel&gt; on &lt;http://evil|x&gt; &amp; co");
  });

  it("posts to the Telegram bot API for that chat", async () => {
    const f = okFetch();
    await deliver("telegram", `${TOKEN}|-1001234`, "hello", f);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: "-1001234", text: "hello" });
  });

  it("refuses any other destination before making a request", async () => {
    const f = okFetch();
    for (const [kind, target] of [
      ["slack", "https://hooks.slack.com.evil.example/services/x"],
      ["slack", "http://hooks.slack.com/services/T/B/x"],
      ["slack", "https://169.254.169.254/latest"],
      ["telegram", "123:short|1"],
      ["telegram", `${TOKEN}|not-a-chat`],
      ["telegram", `${TOKEN}`],
    ] as const) {
      await expect(deliver(kind, target, "x", f)).rejects.toBeInstanceOf(DeliveryError);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("never puts the token or webhook in an error", async () => {
    const down = vi.fn(async () => new Response("no", { status: 403 }));
    const err = await deliver("telegram", `${TOKEN}|1`, "x", down).catch((e: Error) => e);
    expect((err as Error).message).toBe("Telegram answered 403");
    const unreachable = vi.fn(async () => {
      throw new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}/sendMessage`);
    });
    const err2 = await deliver("telegram", `${TOKEN}|1`, "x", unreachable).catch((e: Error) => e);
    expect((err2 as Error).message).not.toContain(TOKEN);
    const err3 = await deliver("slack", SLACK, "x", down).catch((e: Error) => e);
    expect((err3 as Error).message).not.toContain("hooks.slack.com");
  });

  it("writes short, single-line messages with a link to act on", () => {
    const m = messages("https://verfy.example");
    expect(m.approval("laptop\nevil", "github", "merge_pull_request", ["VFY-TOOL-002"])).toBe(
      "Verfy: laptop evil asks to run github/merge_pull_request (VFY-TOOL-002). Approve or reject it: https://verfy.example/dashboard/approvals",
    );
    const silent = m.silent(Array.from({ length: 12 }, (_, i) => ({ name: `dev${i}`, last_seen_at: "2026-10-23T08:00:00Z" })));
    expect(silent).toContain("and 2 more");
    expect(slackSafe("a<b>&")).toBe("a&lt;b&gt;&amp;");
  });
});
