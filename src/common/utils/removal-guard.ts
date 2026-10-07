/** Share of an ERP catalog one sync run may retire at once. */
const MAX_REMOVAL_SHARE = 0.1;
/** Floor, so a small catalog can still lose a few items in one run. */
const MIN_REMOVAL_ALLOWANCE = 5;

/**
 * Whether a sync run may retire `removing` items out of `catalogSize`
 * ERP-backed ones. An empty feed or a large drop is far more likely a
 * bridge or Profit Plus problem (a failed query, the wrong database) than
 * that many real deletions, so the run keeps everything and says so instead.
 */
export function removalAllowed(removing: number, catalogSize: number, feedSize: number): boolean {
  if (feedSize === 0) return false;
  return removing <= Math.max(MIN_REMOVAL_ALLOWANCE, Math.floor(catalogSize * MAX_REMOVAL_SHARE));
}
