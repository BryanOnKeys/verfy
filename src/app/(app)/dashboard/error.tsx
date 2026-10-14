"use client";

import { Icon } from "@/components/icons";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass empty" role="alert">
      <span className="icon-well">
        <Icon name="alert" size={24} />
      </span>
      <h2 style={{ fontSize: "1.15rem" }}>This page could not be loaded</h2>
      <p>Something went wrong while loading your data. Nothing was changed.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
        <span>Try again</span>
      </button>
    </div>
  );
}
