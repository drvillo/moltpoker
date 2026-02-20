/** Track which hand numbers have scheduled next-hand (tableId -> hand number) */
export const scheduledNextHandForHand = new Map<string, number>();

/**
 * Clear scheduled next-hand for a table (cleanup when table is destroyed)
 */
export function clearScheduledNextHand(tableId: string): void {
  scheduledNextHandForHand.delete(tableId);
}
