"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EVENT_LABELS, NOTIFY_EVENTS, type NotifyEvent } from "@/core/notify";
import { api } from "./api";
import { ConfirmAction } from "./decision-buttons";
import { Icon } from "./icons";
import { ErrorNote } from "./states";

export function AddChannelForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"slack" | "telegram">("slack");
  const [label, setLabel] = useState("");
  const [slackUrl, setSlackUrl] = useState("");
  const [token, setToken] = useState("");
  const [chat, setChat] = useState("");
  const [events, setEvents] = useState<NotifyEvent[]>(["approval.request", "lock.propose", "device.silent"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(e: NotifyEvent) {
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body =
      kind === "slack"
        ? { kind, label: label || "Slack", events, slack_url: slackUrl }
        : { kind, label: label || "Telegram", events, telegram_token: token, telegram_chat_id: chat };
    const res = await api<{ id: string }>("POST", `/api/v1/orgs/${orgId}/notifications`, body);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "The channel could not be added.");
    setSlackUrl("");
    setToken("");
    setChat("");
    setLabel("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="stack" autoComplete="off">
      {error && <ErrorNote message={error} />}
      <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ marginBottom: 6 }}>
          Send to
        </legend>
        {(["slack", "telegram"] as const).map((k) => (
          <label key={k} className="row small" style={{ gap: 6 }}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            {k === "slack" ? "Slack" : "Telegram"}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="ch-label">Name (for you)</label>
        <input id="ch-label" className="input" maxLength={80} placeholder={kind === "slack" ? "#security" : "Ops group"} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      {kind === "slack" ? (
        <div className="field">
          <label htmlFor="ch-slack">Slack incoming webhook URL</label>
          <input id="ch-slack" type="password" className="input" required maxLength={300} placeholder="https://hooks.slack.com/services/…" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} />
          <span className="small muted">Slack → Apps → Incoming Webhooks → Add New Webhook, pick the channel, copy the URL.</span>
        </div>
      ) : (
        <div className="grid-2">
          <div className="field">
            <label htmlFor="ch-token">Bot token</label>
            <input id="ch-token" type="password" className="input" required maxLength={80} placeholder="123456789:AA…" value={token} onChange={(e) => setToken(e.target.value)} />
            <span className="small muted">From @BotFather (/newbot). Add the bot to your group.</span>
          </div>
          <div className="field">
            <label htmlFor="ch-chat">Chat ID</label>
            <input id="ch-chat" className="input" required maxLength={21} inputMode="numeric" placeholder="-1001234567890" value={chat} onChange={(e) => setChat(e.target.value)} />
            <span className="small muted">The group or chat to post in.</span>
          </div>
        </div>
      )}
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
        <legend className="small" style={{ marginBottom: 6 }}>
          Events
        </legend>
        {NOTIFY_EVENTS.map((ev) => (
          <label key={ev} className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={events.includes(ev)} onChange={() => toggle(ev)} />
            {EVENT_LABELS[ev]}
          </label>
        ))}
      </fieldset>
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || events.length === 0}>
          <Icon name="check" size={16} />
          <span>{busy ? "Adding…" : "Add channel"}</span>
        </button>
      </div>
      <p className="small muted">The webhook URL or bot token is kept for the server only. Nobody can read it back, including you; to change it, remove the channel and add it again.</p>
    </form>
  );
}

export function ChannelActions({ orgId, id, label }: { orgId: string; id: string; label: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; note: string | null; error: string | null }>({ busy: false, note: null, error: null });
  async function test() {
    setState({ busy: true, note: null, error: null });
    const res = await api("POST", `/api/v1/orgs/${orgId}/notifications/${id}/test`, {});
    setState({ busy: false, note: res.ok ? "Sent. Check the channel." : null, error: res.ok ? null : (res.error ?? "Not delivered.") });
    router.refresh();
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={state.busy} aria-label={`Send a test message to ${label}`}>
          <span>{state.busy ? "Sending…" : "Send test"}</span>
        </button>
        <ConfirmAction
          trigger="Remove"
          title={`Remove ${label}?`}
          body="Verfy stops sending messages to this channel. You can add it again later."
          confirm="Remove"
          onConfirm={async () => {
            const res = await api("DELETE", `/api/v1/orgs/${orgId}/notifications/${id}`);
            if (!res.ok) return res.error ?? "The channel could not be removed.";
            router.refresh();
            return null;
          }}
        />
      </div>
      {state.note && <span className="small" role="status">{state.note}</span>}
      {state.error && <ErrorNote message={state.error} />}
    </div>
  );
}
