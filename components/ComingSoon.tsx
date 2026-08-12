export function ComingSoon({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="flex h-full min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="rounded-full border border-border-strong px-3 py-1 font-data text-[11px] tracking-widest text-text-faint uppercase">
        Phase 2 · Coming soon
      </span>
      <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
      <p className="max-w-md text-sm text-text-muted">{blurb}</p>
    </div>
  );
}
