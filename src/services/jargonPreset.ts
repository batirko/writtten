/**
 * General PM/product vocabulary that flash-lite models consistently flag
 * as undefined jargon. These are universally understood in the target persona
 * (Product Managers) and should never require a definition in a PM doc.
 *
 * Domain-specific presets (payments, enterprise, consumer, etc.) belong in a
 * later phase. This preset covers only terms that cut across all PM sub-domains.
 */
export const JARGON_PRESET: string[] = [
  // Process
  "sprint", "backlog", "roadmap", "milestone", "stakeholder",
  "mvp", "poc", "v1", "go-live", "launch",
  // Goal-setting
  "okr", "kpi", "roi", "nps",
  // Growth / UX
  "friction", "funnel", "conversion", "retention", "churn",
  "a/b test", "experiment", "hypothesis", "rollout", "soft launch", "cohort",
  // Analytics
  "dau", "mau", "arpu", "cac", "ltv",
  // Platform-adjacent (widely used in PM docs without being defined)
  "api", "sdk", "sla", "slo",
];
