function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

// Shared avatar rendering — an <img> against the avatar-serving route
// when the user has uploaded a picture (see app/api/account/avatar/
// [userId]/route.ts), otherwise a deterministic initials circle so the
// account widget never shows a broken-image icon.
export function Avatar({
  userId,
  name,
  hasAvatar,
  size = 32,
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
  size?: number;
}) {
  if (hasAvatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from a role-gated API route, not a static/optimizable asset
      <img
        src={`/api/account/avatar/${userId}`}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-panel-raised font-display font-semibold text-text-muted"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}
