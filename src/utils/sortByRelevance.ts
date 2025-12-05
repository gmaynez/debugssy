// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Sorts items by relevance to a partial search string.
 * Items that start with the partial are ranked higher than items that just contain it.
 *
 * @param items - Array of items to sort
 * @param partial - Partial search string to match against
 * @param getKey - Function to extract the sortable key from each item (defaults to item itself for strings)
 * @returns Sorted array (mutates original)
 */
export function sortByRelevance<T>(
  items: T[],
  partial: string | undefined,
  getKey: (item: T) => string = (item) => String(item)
): T[] {
  if (!partial) {
    // No partial to match - just sort alphabetically
    return items.sort((a, b) => getKey(a).localeCompare(getKey(b)));
  }

  const lowerPartial = partial.toLowerCase();

  return items.sort((a, b) => {
    const aKey = getKey(a).toLowerCase();
    const bKey = getKey(b).toLowerCase();
    const aStarts = aKey.startsWith(lowerPartial);
    const bStarts = bKey.startsWith(lowerPartial);

    // Prefix matches first
    if (aStarts && !bStarts) {
      return -1;
    }
    if (!aStarts && bStarts) {
      return 1;
    }

    // Then alphabetically
    return getKey(a).localeCompare(getKey(b));
  });
}

/**
 * Filters items by partial string match (case-insensitive).
 *
 * @param items - Array of items to filter
 * @param partial - Partial search string to match against
 * @param getKey - Function to extract the searchable key from each item
 * @returns Filtered array
 */
export function filterByPartial<T>(
  items: T[],
  partial: string | undefined,
  getKey: (item: T) => string = (item) => String(item)
): T[] {
  if (!partial) {
    return items;
  }

  const lowerPartial = partial.toLowerCase();
  return items.filter((item) => getKey(item).toLowerCase().includes(lowerPartial));
}

/**
 * Combines filter and sort operations for completion results.
 * Filters items by partial match, then sorts by relevance.
 *
 * @param items - Array of items to filter and sort
 * @param partial - Partial search string
 * @param getKey - Function to extract the key from each item
 * @returns Filtered and sorted array
 */
export function filterAndSortByRelevance<T>(
  items: T[],
  partial: string | undefined,
  getKey: (item: T) => string = (item) => String(item)
): T[] {
  const filtered = filterByPartial(items, partial, getKey);
  return sortByRelevance(filtered, partial, getKey);
}
