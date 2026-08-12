// Reserved seam for Keap — not wired into any Phase 1 UI. Intended for
// the future CRM and Marketing Automation modules. Mocked the same way
// halopsa.ts is: a function shaped like a real API call, returning
// fixture data for now.

export type MockPipelineSummary = {
  openOpportunities: number;
  valueInPipeline: number;
  campaignsActive: number;
};

export async function getPipelineSummary(): Promise<MockPipelineSummary> {
  return { openOpportunities: 8, valueInPipeline: 64000, campaignsActive: 2 };
}
