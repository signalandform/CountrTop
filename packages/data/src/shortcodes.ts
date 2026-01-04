import type { KitchenTicket } from '@countrtop/models';

/**
 * Shortcode assignment rules:
 * - POS: 1-20 (looping, find next available)
 * - CountrTop: M31-M39 (looping, find next available)
 */

type Source = 'countrtop_online' | 'square_pos';

/**
 * Generates the next available shortcode for a given source and location
 * @param locationId - Square location ID
 * @param source - Order source
 * @param existingShortcodes - Array of currently assigned shortcodes for this location
 * @returns Shortcode string or null if none available
 */
export function assignShortcode(
  locationId: string,
  source: Source,
  existingShortcodes: string[]
): string | null {
  const usedCodes = new Set(existingShortcodes);

  switch (source) {
    case 'square_pos': {
      // POS: 1-20 (looping)
      for (let i = 1; i <= 20; i++) {
        const code = i.toString();
        if (!usedCodes.has(code)) {
          return code;
        }
      }
      // If all 1-20 are taken, loop back to 1
      return '1';
    }

    case 'countrtop_online': {
      // CountrTop: M31-M39 (looping)
      for (let i = 31; i <= 39; i++) {
        const code = `M${i}`;
        if (!usedCodes.has(code)) {
          return code;
        }
      }
      // If all M31-M39 are taken, loop back to M31
      return 'M31';
    }

    default:
      // Fallback: treat as POS
      for (let i = 1; i <= 20; i++) {
        const code = i.toString();
        if (!usedCodes.has(code)) {
          return code;
        }
      }
      return '1';
  }
}

/**
 * Validates that a shortcode is unique for a location
 * @param locationId - Square location ID
 * @param shortcode - Shortcode to validate
 * @param existingTickets - Array of existing tickets for this location
 * @returns true if unique, false if duplicate
 */
export function isShortcodeUnique(
  locationId: string,
  shortcode: string,
  existingTickets: KitchenTicket[]
): boolean {
  const locationTickets = existingTickets.filter(t => t.locationId === locationId);
  return !locationTickets.some(t => t.shortcode === shortcode);
}

