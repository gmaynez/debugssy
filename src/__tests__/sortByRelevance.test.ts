// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, expect, it } from 'vitest';
import {
  filterAndSortByRelevance,
  filterByPartial,
  sortByRelevance,
} from '../utils/sortByRelevance';

describe('relevance sorting', () => {
  it('sorts alphabetically when partial is missing or empty', () => {
    expect(sortByRelevance(['zebra', 'alpha', 'middle'], undefined)).toEqual([
      'alpha',
      'middle',
      'zebra',
    ]);
    expect(sortByRelevance(['zebra', 'alpha', 'middle'], '')).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('ranks prefix matches before other matches and alphabetizes within groups', () => {
    const result = sortByRelevance(['src/zeta.ts', 'test/alpha.ts', 'src/alpha.ts'], 'src');
    expect(result).toEqual(['src/alpha.ts', 'src/zeta.ts', 'test/alpha.ts']);
  });

  it('matches and ranks case-insensitively while preserving original values', () => {
    const result = filterAndSortByRelevance(['Other.ts', 'SRC/Beta.ts', 'src/alpha.ts'], 'sRc');
    expect(result).toEqual(['src/alpha.ts', 'SRC/Beta.ts']);
  });

  it('supports custom keys for filtering and sorting', () => {
    const items = [{ name: 'zeta' }, { name: 'Alpha' }, { name: 'alphabet' }];
    const getKey = (item: { name: string }) => item.name;
    expect(filterAndSortByRelevance(items, 'alpha', getKey)).toEqual([
      { name: 'Alpha' },
      { name: 'alphabet' },
    ]);
  });

  it('returns the original collection when filter partial is missing', () => {
    const items = ['b', 'a'];
    expect(filterByPartial(items, undefined)).toBe(items);
    expect(filterByPartial(items, '')).toBe(items);
  });

  it('returns no matches when the partial is absent from every key', () => {
    expect(filterByPartial(['alpha', 'beta'], 'missing')).toEqual([]);
  });
});
