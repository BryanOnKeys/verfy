"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/auth/actions";
import { requestPasswordReset, signInWithMagicLink, signInWithPassword, signUp, updatePassword } from "@/app/auth/actions";
import { Captcha } from "./captcha";
import { Icon } from "./icons";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending} style={{ width: "100%" }}>
      <span>{pending ? "Working…" : children}</span>
    </button>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <div className="alert alert-error" role="alert">
        <Icon name="alert" size={16} />
        <span>{state.error}</span>
      </div>
    );
  if (state.message)
    return (
      <div className="alert alert-success" role="status">
        <Icon name="check" size={16} />
        <span>{state.message}</span>
      </div>
    );
  return null;
}

export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction] = useActionState(signInWithPassword, {});
  const [mlState, mlAction] = useActionState(signInWithMagicLink, {});
  const state = mode === "password" ? pwState : mlState;
  return (
    <div className="stack">
      <div className="row" role="tablist" aria-label="Sign-in method" style={{ gap: 6 }}>
        <button type="button" role="tab" aria-selected={mode === "password"} className={`btn btn-sm ${mode === "password" ? "btn-secondary" : "btn-ghost"}`} onClick={() => setMode("password")}>
          <span>Password</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "magic"} className={`btn btn-sm ${mode === "magic" ? "btn-secondary" : "btn-ghost"}`} onClick={() => setMode("magic")}>
          <span>Email link</span>
        </button>
      </div>
      <Feedback state={state} />
      {mode === "password" ? (
        <form action={pwAction} className="stack" noValidate={false}>
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required maxLength={254} defaultValue={pwState.fields?.email} />
          </div>
          <div className="field">
            <div className="row-between">
              <label htmlFor="password">Password</label>
              <Link href="/auth/forgot-password" className="small link">
                Forgot password?
              </Link>
            </div>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required maxLength={128} />
          </div>
          <Captcha resetOn={pwState} />
          <Submit>Sign in</Submit>
        </form>
      ) : (
        <form action={mlAction} className="stack">
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label htmlFor="ml-email">Email</label>
            <input id="ml-email" name="email" type="email" className="input" autoComplete="email" required maxLength={254} defaultValue={mlState.fields?.email} />
            <span className="hint">We send a one-time sign-in link. It works for existing accounts only.</span>
          </div>
          <Captcha resetOn={mlState} />
          <Submit>Send sign-in link</Submit>
        </form>
      )}
    </div>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, {});
  return (
    <form action={action} className="stack">
      <Feedback state={state} />
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required maxLength={254} defaultValue={state.fields?.email} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="pw-hint" />
        <span id="pw-hint" className="hint">At least 12 characters.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required minLength={12} maxLength={128} />
      </div>
      <Captcha resetOn={state} />
      <Submit>Create account</Submit>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {});
  return (
    <form action={action} className="stack">
      <Feedback state={state} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required maxLength={254} />
      </div>
      <Captcha resetOn={state} />
      <Submit>Send reset link</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, {});
  return (
    <form action={action} className="stack">
      <Feedback state={state} />
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={12} maxLength={128} />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required minLength={12} maxLength={128} />
      </div>
      <Submit>Update password</Submit>
      {state.message && (
        <Link href="/dashboard" className="btn btn-secondary">
          <span>Go to the dashboard</span>
        </Link>
      )}
    </form>
  );
}
