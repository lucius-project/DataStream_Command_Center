import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth/roleRank";

// Role-aware landing — /business-health is Service Manager+ only and
// would just bounce anyone else straight to /not-authorized.
// Technician's home is their own performance view; SDR has no home of
// its own yet (reserved role, no CRM page built) so it lands there too
// rather than on a page it can't open.
export default async function RootPage() {
  const session = await requireSignedIn();
  redirect(session.role === "SERVICE_MANAGER" || session.role === "CEO" ? "/business-health" : "/tech-performance");
}
