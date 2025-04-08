type FuzzySearchMatch = boolean;

interface FuzzySearchResult {
  target: string;
  score: number;
  matches: FuzzySearchMatch[];
}

type FuzzySortResult = (FuzzySearchResult & {
  item: any;
  index: number;
})[];

const fuzzySearch = (query: string, target: string): FuzzySearchResult => {
	// Initialize matches array (undefined means unmatched)
	const matches = new Array(target.length).fill(undefined);

	// Handle empty query
	if (!query) {
		return {target, score: 0, matches};
	}

	// Case-insensitive matching
	const lowerQuery = query.toLowerCase();
	const lowerTarget = target.toLowerCase();

	let score = 0;
	let lastMatchIndex = -1;

	// Try to match each character in the query
	for (let i = 0; i < lowerQuery.length; i++) {
		const queryChar = lowerQuery[i];
		let found = false;

		// Find the next occurrence in the target
		for (let j = lastMatchIndex + 1; j < lowerTarget.length; j++) {
			if (lowerTarget[j] === queryChar) {
				// Mark this position as matched
				matches[j] = true;
				found = true;

				// Calculate score for this match
				let matchScore = 1;

				// Bonus for matching at the start of the target
				if (j === 0) {
					matchScore += 2;
				}
				// Bonus for matching after word boundaries
				else if (/[\s\-_.]/.test(lowerTarget[j - 1])) {
					matchScore += 1.5;
				}

				// Bonus for consecutive matches
				if (j === lastMatchIndex + 1) {
					matchScore += 1;
				}

				score += matchScore;
				lastMatchIndex = j;
				break;
			}
		}

		// Penalty for unmatched query characters
		if (!found) {
			score = Math.max(0, score - 1);
		}
	}

	// Calculate match statistics
	const matchCount = matches.filter(Boolean).length;

	// Adjust score based on match quality
	score = score * (matchCount / lowerQuery.length) * Math.sqrt(matchCount / lowerTarget.length);

	if (target.toLowerCase().includes(query.toLowerCase())) {
		score += 1;
	}
	if (target.includes(query)) {
		score += 0.5;
	}

	// Round to 2 decimal places
	score = Math.round(score * 100) / 100;

	return {target, score, matches};
}

const fuzzyHighlight = (
  searchResult: FuzzySearchResult,
  highlighter = (match: string) => <mark>{match}</mark>
) => {
  const target = searchResult.target;
  const matches = searchResult.matches;
  const separator = "\x00";

  const highlighted = [];
  let open = false;

  for (let index = 0; index < target.length; index++) {
    const char = target[index];
    const matched = matches[index];
    if (!open && matched) {
      highlighted.push(separator);
      open = true;
    } else if (open && !matched) {
      highlighted.push(separator);
      open = false;
    }
    highlighted.push(char);
  }

  if (open) {
    highlighted.push(separator);
    open = false;
  }

  return (
    <>
      {highlighted
        .join("")
        .split(separator)
        .map((part, index) => (index % 2 ? highlighter(part) : part))}
    </>
  );
};

const fuzzySort = (
  value: string,
  items: any[],
  key?: string | ((item: any) => any),
): FuzzySortResult => {
  const sorted = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const target = key
      ? typeof key === "function"
        ? key(item)
        : item[key]
      : item;

    const result = fuzzySearch(value, target);
    if (result.score) {
      sorted.push({ ...result, item, index });
    }
  }

  sorted.sort((a, b) => {
    let delta = b.score - a.score;
    if (delta === 0) {
      delta = a.index - b.index;
    }
    return delta;
  });

  return sorted;
};

export { fuzzySort, fuzzySearch, fuzzyHighlight };
export type { FuzzySearchResult, FuzzySortResult };