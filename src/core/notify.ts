/**
 * Notification messages and delivery to Slack (incoming webhook) or Telegram (bot API).
 *
 * Only two destinations exist: https://hooks.slack.com/services/… and https://api.telegram.org.
 * Anything else is refused before a request is made, so a channel cannot be pointed at an
 * internal address. Errors never include the webhook URL or the bot token.
 */

export const NOTIFY_EVENTS = ["approval.request", "lock.propose", "receipt.deny", "device.silent"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const EVENT_LABELS: Record<NotifyEvent, string> = {
  "approval.request": "A call waits for approval",
  "lock.propose": "A tool definition changed",
  "receipt.deny": "Calls were denied",
  "device.silent": "A device stopped uploading receipts (24 hours)",
};

export const SLACK_WEBHOOK = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;
export const TELEGRAM_TOKEN = /^[0-9]{5,12}:[A-Za-z0-9_-]{30,50}$/;
export const TELEGRAM_CHAT = /^-?[0-9]{1,20}$/;

export type Kind = "slack" | "telegram";
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Device, server and tool names come from devices: keep Slack from reading them as mentions or links. */
export function slackSafe(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class DeliveryError extends Error {}

export async function deliver(kind: Kind, target: string, text: string, fetchImpl: Fetch = fetch): Promise<void> {
  let url: string;
  let body: Record<string, unknown>;
  if (kind === "slack") {
    if (!SLACK_WEBHOOK.test(target)) throw new DeliveryError("not a Slack incoming webhook URL");
    url = target;
    body = { text: slackSafe(text) };
  } else {
    const [token, chat] = target.split("|");
    if (!token || !chat || !TELEGRAM_TOKEN.test(token) || !TELEGRAM_CHAT.test(chat)) throw new DeliveryError("not a Telegram bot token and chat ID");
    url = `https://api.telegram.org/bot${token}/sendMessage`;
    body = { chat_id: chat, text, disable_web_page_preview: true };
  }
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new DeliveryError(`could not reach ${kind === "slack" ? "Slack" : "Telegram"}`);
  }
  if (!res.ok) throw new DeliveryError(`${kind === "slack" ? "Slack" : "Telegram"} answered ${res.status}`);
}

export function messages(appUrl: string) {
  const line = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);
  return {
    approval: (device: string, server: string, tool: string, rules: string[]) =>
      `Verfy: ${line(device)} asks to run ${line(server)}/${line(tool)} (${rules.slice(0, 5).join(", ")}). Approve or reject it: ${appUrl}/dashboard/approvals`,
    lock: (device: string, server: string, tool: string) =>
      `Verfy: ${line(device)} reports that the MCP tool ${line(server)}/${line(tool)} changed or is new. It stays blocked until someone reviews it: ${appUrl}/dashboard/locks`,
    deny: (device: string, count: number, rules: string[]) =>
      `Verfy: ${count} call${count === 1 ? " was" : "s were"} denied on ${line(device)} (${rules.slice(0, 5).join(", ")}). Receipts: ${appUrl}/dashboard/receipts`,
    silent: (devices: { name: string; last_seen_at: string }[]) =>
      `Verfy: no receipts for over 24 hours from ${devices
        .slice(0, 10)
        .map((d) => `${line(d.name)} (last ${d.last_seen_at.slice(0, 16).replace("T", " ")} UTC)`)
        .join(", ")}${devices.length > 10 ? ` and ${devices.length - 10} more` : ""}. The hook may be off or verfy sync is not running: ${appUrl}/dashboard/devices`,
    test: () => `Verfy: test message. This channel will get the events you picked. Manage it: ${appUrl}/dashboard/notifications`,
  };
}
