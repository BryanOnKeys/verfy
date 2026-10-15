import Link from "next/link";
import { Icon, type IconName } from "./icons";

export function EmptyState({ icon = "info", title, body, action }: { icon?: IconName; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="glass empty">
      <span className="icon-well">
        <Icon name={icon} size={24} />
      </span>
      <h2 style={{ fontSize: "1.15rem" }}>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function PermissionDenied({ what }: { what: string }) {
  return (
    <EmptyState
      icon="lock"
      title="You don't have access to this"
      body={`Your role in this organization cannot ${what}. Ask an owner or admin if you need it.`}
      action={
        <Link href="/dashboard" className="btn btn-secondary btn-sm">
          <span>Back to overview</span>
        </Link>
      }
    />
  );
}

export function NotConfigured() {
  return (
    <div className="alert alert-warning" role="status">
      <Icon name="alert" size={16} />
      <span>
        This Verfy deployment is not connected to Supabase yet, so live data cannot be shown. Set the environment variables in{" "}
        <code className="inline-code">.env.example</code> (see <code className="inline-code">docs/DEPLOYMENT.md</code>).
      </span>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="alert alert-error" role="alert">
      <Icon name="alert" size={16} />
      <span>{message}</span>
    </div>
  );
}
