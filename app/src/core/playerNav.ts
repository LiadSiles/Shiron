/** How long a push to the full player may take to mount before another push is allowed. */
export const PUSH_GRACE_MS = 1500;

/**
 * How to show the full player (player/showPlayer). `screens`: full players mounted now;
 * `pushedAt`: when the last push that hasn't mounted yet happened (0 = none). Never a second
 * player in the stack — with two, "חזרה" seemed to do nothing (owner, 0.11.0).
 */
export function playerRoute(screens: number, pushedAt: number, now: number, canDismiss: boolean): 'push' | 'back-to-it' | 'stay' {
  if (screens > 0) return canDismiss ? 'back-to-it' : 'stay';
  if (pushedAt && now - pushedAt < PUSH_GRACE_MS) return 'stay';
  return 'push';
}
