function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

export function fuzzySearchMatch(query: string, values: string[]): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const normalizedValues = values.map(normalizeSearchValue).filter(Boolean);
  const combined = normalizedValues.join(" ");
  if (combined.includes(normalizedQuery)) return true;

  const compactQuery = normalizedQuery.replace(/\s/g, "");
  if (normalizedValues.some((value) => value.replace(/\s/g, "").includes(compactQuery))) {
    return true;
  }

  if (!/^[a-z0-9.]+$/.test(compactQuery) || compactQuery.length < 3) return false;
  const limit = compactQuery.length <= 5 ? 1 : compactQuery.length <= 9 ? 2 : 3;
  return normalizedValues
    .flatMap((value) => value.split(" "))
    .some((token) => editDistance(compactQuery, token.replace(/\s/g, ""), limit) <= limit);
}
