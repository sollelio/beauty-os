// Business Health V1 insight thresholds (product defaults, Business Health Slices 01–04). The only place they live:
// screens never hard-code them. Comparison rules (which periods are comparable) live with the read model
// (private.business_health_config).
export const INSIGHT_THRESHOLDS = {
  maxShown: 5,
  /** 3 · production up at least this much while the operating result fell at least `resultDropPct`. */
  productionUpPct: 10,
  resultDropPct: 5,
  /** 4 · production down at least this much, with at least `minServices` active services in the period. */
  productionDropPct: 15,
  minServices: 10,
  /** 5 · an expense category this much above its average over `averageWindow` completed periods… */
  categoryAbovePct: 25,
  averageWindow: 3,
  /** …present in at least this many of them… */
  categoryMinPresence: 2,
  /** …and the excess over the average at least this share of the period's production. */
  categoryMinImpactPctOfProduction: 3,
  /** 6 · team concentration: one professional at least this share of production, or the two largest together at
   *  least `concentrationTopTwoPct`, with at least `concentrationMinProfessionals` active professionals. */
  concentrationTopPct: 40,
  concentrationTopTwoPct: 65,
  concentrationMinProfessionals: 3,
  /** 7 · service concentration: one service at least this share of production, or the two largest together at least
   *  `serviceTopTwoPct`, with at least `serviceMinDistinct` services performed. */
  serviceTopPct: 35,
  serviceTopTwoPct: 55,
  serviceMinDistinct: 5,
  /** 8 / 9 · a service's count moving the same way in two consecutive comparisons (three comparable periods), by at
   *  least `serviceTrendPct` in all, from at least `serviceTrendMinBaseline` records in the first period. */
  serviceTrendPct: 20,
  serviceTrendMinBaseline: 5,
  /** 10 · salon-funded purchases at least this much above the previous comparable period, and at least
   *  `purchasesMinPctOfProduction` of the period's production. */
  purchasesUpPct: 25,
  purchasesMinPctOfProduction: 5,
  /** 11 · a product bought, or marked baixo/comprar, at least this many times in the read model's window (30 days). */
  productRepeatCount: 3,
  /** Drivers listed in an explanation. */
  maxDrivers: 3,
} as const
export type InsightThresholds = { readonly [K in keyof typeof INSIGHT_THRESHOLDS]: number }
