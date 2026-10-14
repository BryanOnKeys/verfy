"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { confirmTotpEnrollment, removeTotpFactor, startTotpEnrollment, verifySecondFactor, type Enrollment } from "@/app/auth/mfa-actions";
import { ConfirmAction } from "./decision-buttons";
import { Icon } from "./icons";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>
      <span>{pending ? "Checking…" : children}</span>
    </button>
  );
}

function CodeInput({ id = "code" }: { id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>6-digit code</label>
      <input
        id={id}
        name="code"
        className="input mono"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        style={{ fontSize: "1.2rem", letterSpacing: "0.3em", maxWidth: 220 }}
      />
    </div>
  );
}

function Feedback({ error, message }: { error?: string; message?: string }) {
  if (error)
    return (
      <div className="alert alert-error" role="alert">
        <Icon name="alert" size={16} />
        <span>{error}</span>
      </div>
    );
  if (message)
    return (
      <div className="alert alert-success" role="status">
        <Icon name="check" size={16} />
        <span>{message}</span>
      </div>
    );
  return null;
}

/** The code prompt shown after the password step. */
export function SecondFactorForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifySecondFactor, {});
  return (
    <form action={action} className="stack">
      <Feedback error={state.error} />
      <input type="hidden" name="next" value={next} />
      <CodeInput />
      <Submit>Verify and continue</Submit>
    </form>
  );
}

/** Settings: turn two-factor authentication on (QR code, then one code) or off. */
export function MfaSettings({ factor }: { factor: { id: string; name: string; created: string } | null }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [starting, start] = useTransition();
  const [state, action] = useActionState(confirmTotpEnrollment, {});

  if (factor) {
    return (
      <div className="stack">
        <div className="row-between">
          <span className="row" style={{ gap: 10 }}>
            <span className="badge badge-ok">on</span>
            <span>
              <strong>{factor.name}</strong> <span className="small muted">added {factor.created}</span>
            </span>
          </span>
          <ConfirmAction
            trigger="Remove"
            title="Turn off two-factor authentication?"
            body="Your account will be protected by your password alone. You can set up a new authenticator afterwards."
            confirm="Turn off"
            onConfirm={async () => {
              const error = await removeTotpFactor(factor.id);
              if (!error) router.refresh();
              return error;
            }}
          />
        </div>
        <p className="small muted">Each sign-in asks for a code from your authenticator app. Organization data stays locked until the code is entered.</p>
      </div>
    );
  }

  if (state.message) return <Feedback message={state.message} />;

  if (!enrollment?.factorId) {
    return (
      <div className="stack">
        <p className="text-2 small">
          Add a second step to sign-in: a 6-digit code from an authenticator app (1Password, Google Authenticator, Authy and others). A stolen
          password alone is then not enough to reach your organization.
        </p>
        {enrollment?.error && <Feedback error={enrollment.error} />}
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={starting} onClick={() => start(async () => setEnrollment(await startTotpEnrollment()))}>
            <Icon name="shieldCheck" size={15} />
            <span>{starting ? "Starting…" : "Set up two-factor authentication"}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="stack">
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <ol className="stack small text-2" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Scan this code with your authenticator app, or type the key by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="row" style={{ alignItems: "flex-start", gap: 20 }}>
        {enrollment.qr && (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL from Supabase, nothing to optimise
          <img src={enrollment.qr} alt="QR code for your authenticator app" width={168} height={168} style={{ background: "#fff", borderRadius: 8, padding: 6 }} />
        )}
        <div className="stack" style={{ gap: 6, minWidth: 0 }}>
          <span className="small muted">Key</span>
          <code className="hash" style={{ fontSize: "0.9rem" }}>{enrollment.secret}</code>
        </div>
      </div>
      <Feedback error={state.error} />
      <CodeInput id="enroll-code" />
      <div className="row">
        <Submit>Turn on</Submit>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEnrollment(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
