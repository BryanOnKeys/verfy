"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, background: "#060a13", color: "#e9eef8" }}>
        <h1>Something went wrong</h1>
        <p>Atls could not load this page. Nothing was changed.</p>
        <button type="button" onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
