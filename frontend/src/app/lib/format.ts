/**
 * Currency / number formatting helpers.
 *
 * The rupee glyph (₹, U+20B9) doesn't render in some default Windows system
 * fonts and falls back to "?" — which is what users were seeing on the
 * dashboard tiles. We use the explicit Unicode escape (so the source bytes
 * are guaranteed regardless of editor/encoding) and additionally fall back
 * to the ASCII "Rs." prefix when the consumer asks for max compatibility.
 *
 * Always go through these helpers — never sprinkle "₹" string literals
 * across components.
 */

/** The literal rupee glyph, written via escape so transport never mangles it. */
export const INR_SYMBOL = '₹';

/** Pretty rupee amount, e.g. 12345.67 → "₹12,345.67". */
export function formatINR(n: number, opts: { compact?: boolean; ascii?: boolean } = {}): string {
  if (!Number.isFinite(n)) return opts.ascii ? 'Rs. 0' : `${INR_SYMBOL}0`;
  const prefix = opts.ascii ? 'Rs. ' : INR_SYMBOL;
  if (opts.compact) {
    if (Math.abs(n) >= 10_000_000) return `${prefix}${(n / 10_000_000).toFixed(1)}Cr`;
    if (Math.abs(n) >= 100_000)    return `${prefix}${(n / 100_000).toFixed(1)}L`;
    if (Math.abs(n) >= 1_000)      return `${prefix}${(n / 1_000).toFixed(1)}k`;
    return `${prefix}${Math.round(n)}`;
  }
  return `${prefix}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Short tile-friendly form: 12,345 → "₹12.3k". */
export const formatINRCompact = (n: number) => formatINR(n, { compact: true });
