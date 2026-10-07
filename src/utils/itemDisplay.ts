/**
 * Utility to format and deduplicate item and variant names cleanly across UI, Receipts, KOTs, and Excel.
 */

/**
 * Returns the full item name with its variant in parentheses, guaranteeing no duplicate variants.
 * Example:
 *   getItemDisplayName("Sambar", "Half") => "Sambar (Half)"
 *   getItemDisplayName("Sambar (Half)", "Half") => "Sambar (Half)"
 *   getItemDisplayName("Sambar (Half)(Half)", "Half") => "Sambar (Half)"
 */
export function getItemDisplayName(rawName?: string, variantName?: string): string {
  let name = String(rawName || 'Item').trim();
  const variant = String(variantName || '').trim();

  // 1. Remove duplicate adjacent parentheses like (half)(half) or (Half) (Half)
  name = name.replace(/\(([^)]+)\)\s*\(([^)]+)\)/gi, (m, g1, g2) => {
    if (g1.trim().toLowerCase() === g2.trim().toLowerCase()) return `(${g1.trim()})`;
    return m;
  });

  if (!variant) return name;

  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 2. Check if name already has this variant in parentheses, e.g. "Sambar (Half)"
  const parenRegex = new RegExp(`\\(\\s*${escaped}\\s*\\)`, 'i');
  if (parenRegex.test(name)) {
    return name;
  }

  // 3. Check if name ends with the variant without parens, e.g. "Sambar - Half"
  const endRegex = new RegExp(`[\\s\\-_/:]+${escaped}$`, 'i');
  if (endRegex.test(name)) {
    return name;
  }

  return `${name} (${variant})`;
}

/**
 * Returns the base item name with any variant suffix stripped away.
 * Used when the UI displays the variant separately as a badge/subtext.
 * Example:
 *   getBaseItemName("Sambar (Half)", "Half") => "Sambar"
 *   getBaseItemName("Sambar", "Half") => "Sambar"
 *   getBaseItemName("Sambar (Half)(Half)", "Half") => "Sambar"
 */
export function getBaseItemName(rawName?: string, variantName?: string): string {
  let name = String(rawName || 'Item').trim();
  const variant = String(variantName || '').trim();

  // Deduplicate adjacent parentheses first
  name = name.replace(/\(([^)]+)\)\s*\(([^)]+)\)/gi, (m, g1, g2) => {
    if (g1.trim().toLowerCase() === g2.trim().toLowerCase()) return `(${g1.trim()})`;
    return m;
  });

  if (!variant) {
    return name;
  }

  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Strip trailing (variant) from the base name
  name = name.replace(new RegExp(`\\s*\\(\\s*${escaped}\\s*\\)\\s*$`, 'i'), '').trim();
  return name;
}
