/** Shown inside the shell while a page fetches its data, so navigation stays instant. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="h-9 w-48 rounded-lg bg-line" />
      <div className="h-40 rounded-xl bg-line/60" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
