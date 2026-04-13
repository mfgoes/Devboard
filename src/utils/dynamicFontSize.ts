/**
 * Calculate dynamic font size for sticky notes based on text content and dimensions
 * Similar to Miro's behavior: more text = smaller font, less text = bigger font
 */

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 48;

export function calculateDynamicFontSize(
  text: string,
  width: number,
  height: number,
): number {
  // Strip HTML tags to get actual text length
  const plainText = text.replace(/<[^>]*>/g, '').trim();

  if (!plainText) {
    return MAX_FONT_SIZE; // Empty note → max size
  }

  // Character count drives the calculation
  const charCount = plainText.length;

  // Scale down from max size based on character count
  // Formula: larger text = smaller font
  // √2 chars → 42px, √5 chars → 38px, √75 chars → 10px
  const fontSize = MAX_FONT_SIZE - Math.sqrt(charCount) * 4.5;

  // Clamp to reasonable range
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize));
}

/**
 * Determine if sticky should auto-grow when dynamic sizing is enabled
 * Returns target width/height if grow is recommended
 */
export function shouldGrowStickyForDynamic(
  text: string,
  currentWidth: number,
  currentHeight: number,
  fontSize: number,
): { width: number; height: number } | null {
  // If dynamic font size already maxed out, consider growing sticky
  const dynamicSize = calculateDynamicFontSize(text, currentWidth, currentHeight);

  if (dynamicSize >= MAX_FONT_SIZE - 2) {
    // Suggest growing by ~20% in each dimension
    return {
      width: Math.round(currentWidth * 1.2),
      height: Math.round(currentHeight * 1.2),
    };
  }

  return null;
}
