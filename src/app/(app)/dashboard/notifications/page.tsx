import type { Metadata } from "next";
import { AddChannelForm, ChannelActions } from "@/components/notification-tools";
import { Icon } from "@/components/icons";
import { EmptyState, ErrorNote } from "@/components/states";
import { EVENT_LABELS, type NotifyEvent } from "@/core/notify";
import { can } from "@/core/permissions";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Notifications" };

interface ChannelRow {
  id: string;
  kind: "slack" | "telegram";
  label: string;
  events: NotifyEvent[];
  target_hint: string;
  created_at: string;
  last_sent_at: string | null;
  last_error: string | null;
}

export default async function NotificationsPage() {
  const { db, org } = await requirePageOrg("/dashboard/notifications");
  const manage = can(org.role, "notifications.manage");
  let channels: ChannelRow[] = [];
  let failed = false;
  if (manage) {
    const { data, error } = await db.rpc("list_notification_channels", { p_org: org.id });
    if (error) failed = true;
    else channels = (data ?? []) as ChannelRow[];
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>Get a Slack or Telegram message when a call waits for approval, a tool definition changes, calls are denied, or a device goes quiet.</p>
        </div>
      </div>

      {!manage ? (
        <p className="text-2">Only owners and admins can set up notifications.</p>
      ) : (
        <div className="grid-side">
          <section className="glass card-lg stack" aria-labelledby="channels-h" data-light>
            <h2 id="channels-h" style={{ fontSize: "1.1rem" }}>
              Channels
            </h2>
            {failed && <ErrorNote message="The channels could not be loaded right now." />}
            {!failed && channels.length === 0 && (
              <EmptyState icon="bell" title="No channels yet" body="Add a Slack webhook or a Telegram bot, then send a test message." />
            )}
            {channels.map((c) => (
              <article key={c.id} className="stack" style={{ gap: 8, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <div className="row-between">
                  <strong>
                    {c.label} <span className="badge badge-info">{c.kind === "slack" ? "Slack" : "Telegram"}</span>
                  </strong>
                  <span className="mono small muted">{c.target_hint}</span>
                </div>
                <div className="small text-2">{c.events.map((e) => EVENT_LABELS[e] ?? e).join(" · ")}</div>
                <div className="small muted">
                  {c.last_sent_at ? `Last message ${fmtDate(c.last_sent_at)}` : "No message sent yet"}
                  {c.last_error ? ` · last error: ${c.last_error}` : ""}
                </div>
                <ChannelActions orgId={org.id} id={c.id} label={c.label} />
              </article>
            ))}
          </section>
          <section className="glass card-lg stack" aria-labelledby="add-h" data-light>
            <h2 id="add-h" style={{ fontSize: "1.1rem" }}>
              Add a channel
            </h2>
            <AddChannelForm orgId={org.id} />
          </section>
        </div>
      )}

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <Icon name="info" size={16} />
        <span>
          Messages name the device, server, tool and rules, never arguments. &quot;A device goes quiet&quot; is checked once a day and means no receipt
          upload for 24 hours; devices that run <code className="inline-code">verfy sync</code> less often will show up there too.
        </span>
      </div>
    </>
  );
}
