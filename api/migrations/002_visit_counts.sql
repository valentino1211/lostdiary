-- Adds the visit-count table. Safe to run more than once.
/* Visit counts — anonymous daily totals (see src/stats.js). No IPs, cookies or IDs. */
CREATE TABLE IF NOT EXISTS stats_daily (
  day    TEXT NOT NULL,                 -- YYYY-MM-DD, UK time
  metric TEXT NOT NULL,                 -- visit, pageview, source, device, country, product_view, bag_add
  key    TEXT NOT NULL DEFAULT '',      -- e.g. 'instagram', 'mobile', 'GB', a product id
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric, key)
);
