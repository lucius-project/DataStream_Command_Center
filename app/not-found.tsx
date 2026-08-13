import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 p-6 pt-24 text-center">
      <FileQuestion className="text-text-faint" size={32} />
      <h1 className="font-display text-lg font-semibold text-text">Page not found</h1>
      <p className="text-sm text-text-muted">This page doesn&apos;t exist, or it moved. Check the sidebar, or head back to Business Health.</p>
      <Link
        href="/business-health"
        className="mt-2 flex min-h-11 items-center rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong"
      >
        Go to Business Health
      </Link>
    </div>
  );
}
