"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "./api";
import { ErrorNote } from "./states";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<{ id: string }>("POST", "/api/v1/orgs", { name: name.trim(), slug });
    if (!res.ok || !res.data) {
      setError(res.error ?? "The organization could not be created.");
      setBusy(false);
      return;
    }
    document.cookie = `verfy_org=${res.data.id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 460 }}>
      {error && <ErrorNote message={error} />}
      <div className="field">
        <label htmlFor="org-name">Organization name</label>
        <input
          id="org-name"
          className="input"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!touched) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="org-slug">URL name</label>
        <input
          id="org-slug"
          className="input mono"
          required
          pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
          value={slug}
          onChange={(e) => {
            setTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          aria-describedby="slug-hint"
        />
        <span id="slug-hint" className="hint">3–40 lowercase letters, numbers and dashes.</span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ justifySelf: "start" }}>
        <span>{busy ? "Creating…" : "Create organization"}</span>
      </button>
    </form>
  );
}
