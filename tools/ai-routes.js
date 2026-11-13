// Read-only seller analytics routes (GET only, under /seller/analytics).
// Never add LLM-backed or writing routes here: competitor-brief, forecast/seasonal,
// trends/calendar, product/smart-suggestion, pricing.
const SHOP = [
  '/seller/analytics/overview?timeRange=30d',
  '/seller/analytics/alerts',
  '/seller/analytics/categories?timeRange=30d',
  '/seller/analytics/competitors',
  '/seller/analytics/shop-comparison',
  '/seller/analytics/tag-gap',
  '/seller/analytics/competitor-tracking',
  '/seller/analytics/forecast/revenue',
  '/seller/analytics/forecast/niches',
  '/seller/analytics/forecast/radar',
  '/seller/analytics/forecast/recommendations',
  '/seller/analytics/listings/intel',
  '/seller/analytics/listings/health',
  '/seller/analytics/listings/health/summary',
  '/seller/analytics/listings/ranking',
  '/seller/analytics/context',
];

const LISTING = [
  '/seller/analytics/listings/:id/intel',
  '/seller/analytics/listings/:id/health',
  '/seller/analytics/listings/:id/health/ml',
  '/seller/analytics/listings/:id/timeseries?timeRange=30d',
  '/seller/analytics/listings/:id/conversion',
  '/seller/analytics/listings/:id/quality',
];

module.exports = { SHOP, LISTING };
