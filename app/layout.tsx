import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { TopBar } from "@/components/TopBar";
import { getSession } from "@/lib/auth/staffSession";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "DataStream Command Center",
  description: "Daily operating system for DataStream Networks Inc.",
};

// Runs before hydration so the correct theme class is on <html> before
// first paint — otherwise the server-rendered (light-default) HTML would
// flash before client JS could apply a stored/system dark preference.
// strategy="beforeInteractive" is next/script's supported way to do this
// (it hoists into the real <head> and blocks like a raw inline <script>
// would, but without Next's App Router head-management warning that a
// hand-written <head><script> triggers). See ThemeToggle for the write side.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  // No session, or signed in but not yet role-assigned (/pending) — no
  // nav chrome at all. There's nothing a technician-to-be can navigate
  // to yet, and showing a sidebar full of links that only redirect away
  // reads as broken rather than as "wait for your role."
  const role = session?.role ?? null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The beforeInteractive theme script above intentionally adds a
      // "dark" class to this element before React hydrates (so there's
      // no flash of the wrong theme) — the server has no way to know a
      // visitor's stored/system preference, so this one attribute is
      // expected to legitimately differ between server and client HTML.
      // suppressHydrationWarning only covers this element's own
      // attributes, not its children or any other real mismatch
      // elsewhere in the tree.
      suppressHydrationWarning
    >
      <body className="flex h-full min-h-screen bg-bg text-text">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {session && role ? (
          <>
            <Sidebar role={role} />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar role={role} session={session} />
              <MobileNav role={role} session={session} />
              <main className="min-w-0 flex-1">{children}</main>
            </div>
          </>
        ) : (
          <main className="min-w-0 flex-1">{children}</main>
        )}
      </body>
    </html>
  );
}
