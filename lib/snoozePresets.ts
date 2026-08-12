// Shared snooze presets — Inbox Command, Operations, and Runbooks all use
// the same three options so "Snooze" means the same thing everywhere.
export const SNOOZE_PRESETS = {
  "3h": () => new Date(Date.now() + 3 * 60 * 60 * 1000),
  tomorrow: () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
    return d;
  },
  next_week: () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(7, 0, 0, 0);
    return d;
  },
} as const;

export type SnoozePreset = keyof typeof SNOOZE_PRESETS;

export function resolveSnoozePreset(preset: string): Date | null {
  if (!(preset in SNOOZE_PRESETS)) return null;
  return SNOOZE_PRESETS[preset as SnoozePreset]();
}

export const SNOOZE_PRESET_OPTIONS: { key: SnoozePreset; label: string }[] = [
  { key: "3h", label: "In 3 hours" },
  { key: "tomorrow", label: "Tomorrow, 7am" },
  { key: "next_week", label: "Next week" },
];
