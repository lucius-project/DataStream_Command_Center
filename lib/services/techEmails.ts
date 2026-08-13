// Tech email lookup for the coaching-draft feature — the only consumer
// of fetchHaloAgentEmails today (app/api/tech-performance/coaching-drafts).
// Deliberately its own small file rather than folded into kpiSettings.ts
// or techPerformance.ts: this is HaloPSA-identity resolution, not KPI
// computation, same reasoning contactDirectory.ts already documents for
// keeping identity-mapping code separate from the metrics that consume it.

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getHaloAccessToken, type Tech } from "@/lib/integrations/halopsa";
import { fetchHaloAgentEmails, matchKnownTech } from "@/lib/integrations/haloShared";

// Returns only techs HaloPSA actually has a matching agent+email for —
// no HaloPSA credential connected, or a tech with no email on their
// agent record, are both silently absent from the map rather than
// guessed at; the caller (coaching-drafts route) treats a missing entry
// as "skip this tech," never a fabricated address.
export async function getTechEmails(knownTechs: readonly Tech[]): Promise<Map<Tech, string>> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) return new Map();

  const clientSecret = decryptToken(credential.encryptedClientSecret);
  const accessToken = await getHaloAccessToken(credential.instanceUrl, credential.clientId, clientSecret);
  const agents = await fetchHaloAgentEmails(credential.instanceUrl, accessToken);

  const emails = new Map<Tech, string>();
  for (const agent of agents) {
    const tech = matchKnownTech(agent.name, knownTechs);
    if (tech && !emails.has(tech)) emails.set(tech, agent.email);
  }
  return emails;
}
