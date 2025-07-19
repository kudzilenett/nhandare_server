/**
 * Currency utility functions for consistent monetary value handling
 */

/**
 * Rounds a number to 2 decimal places (cents)
 * @param amount - The amount to round
 * @returns The rounded amount
 */
export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Formats a currency amount for display
 * @param amount - The amount to format
 * @param currency - The currency code (default: USD)
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD"
): string {
  const roundedAmount = roundToCents(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(roundedAmount);
}

/**
 * Calculates prize distribution percentages and rounds to cents
 * @param prizePool - Total prize pool amount
 * @param firstPlacePercent - First place percentage (default: 60)
 * @param secondPlacePercent - Second place percentage (default: 25)
 * @param thirdPlacePercent - Third place percentage (default: 15)
 * @returns Object with rounded prize amounts
 */
export function calculatePrizeDistribution(
  prizePool: number,
  firstPlacePercent: number = 60,
  secondPlacePercent: number = 25,
  thirdPlacePercent: number = 15
): { first: number; second: number; third: number } {
  return {
    first: roundToCents(prizePool * (firstPlacePercent / 100)),
    second: roundToCents(prizePool * (secondPlacePercent / 100)),
    third: roundToCents(prizePool * (thirdPlacePercent / 100)),
  };
}
