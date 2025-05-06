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
	// Initialize matches array
	const matches = new Array(target.length).fill(undefined);
  
	// Handle empty query
	if (!query) {
	  return {target, score: 0, matches};
	}
  
	// Case-insensitive matching
	const lowerQuery = query.toLowerCase().trim();
	const lowerTarget = target.toLowerCase();
  
	// Normalize text by treating certain characters as spaces
	const normalizeText = (text: any) => {
	  return text
		.replace(/[:\/\-_]/g, ' ') // Treat special chars as spaces
		.replace(/\s+/g, ' ')      // Normalize multiple spaces
		.trim();
	};
	
	const normalizedQuery = normalizeText(lowerQuery);
	const normalizedTarget = normalizeText(lowerTarget);
	
	// Split query into terms
	const queryTerms = normalizedQuery.split(' ').filter((term: any) => term.length > 0);
	
	// Check if ALL query terms exist in the target
	const allTermsFound = queryTerms.every((term: any) => normalizedTarget.includes(term));
	
	if (!allTermsFound) {
	  return {target, score: 0, matches: new Array(target.length).fill(undefined)};
	}
	
	// Find positions where terms appear
	let score = 50; // Base score for matching all terms
	
	// Mark matching regions in the original target
	const termPositions = [];
	
	for (const term of queryTerms) {
	  let pos = normalizedTarget.indexOf(term);
	  while (pos !== -1) {
		termPositions.push({start: pos, end: pos + term.length});
		pos = normalizedTarget.indexOf(term, pos + 1);
	  }
	}
	
	// Convert normalized positions to positions in original text
	const normalizedToOriginal = [];
	let normalizedPos = 0;
	
	for (let i = 0; i < lowerTarget.length; i++) {
	  if (!/[:\/\-_\s]/.test(lowerTarget[i])) {
		normalizedToOriginal[normalizedPos] = i;
		normalizedPos++;
	  }
	}
	
	// Mark matches in original text
	for (const {start, end} of termPositions) {
	  for (let i = start; i < end; i++) {
		if (normalizedToOriginal[i] !== undefined) {
		  matches[normalizedToOriginal[i]] = true;
		}
	  }
	}
	
	// Calculate score based on:
	// 1. Percentage of the query found in the target
	const queryCharsFound = matches.filter(Boolean).length;
	const queryCharsTotal = lowerQuery.replace(/\s+/g, '').length;
	const completeness = queryCharsFound / queryCharsTotal;
	
	// 2. Term adjacency (terms appearing close together)
	let adjacencyBonus = 0;
	if (termPositions.length > 1) {
	  // Sort positions
	  termPositions.sort((a, b) => a.start - b.start);
	  
	  // Calculate average distance between terms
	  let totalGap = 0;
	  for (let i = 1; i < termPositions.length; i++) {
		totalGap += termPositions[i].start - termPositions[i-1].end;
	  }
	  const avgGap = totalGap / (termPositions.length - 1);
	  
	  // Smaller gaps = better matches
	  adjacencyBonus = Math.max(0, 30 - avgGap * 2);
	}
	
	// 3. Consecutive terms bonus
	let consecutiveBonus = 0;
	const queryTermsString = queryTerms.join(' ');
	if (normalizedTarget.includes(queryTermsString)) {
	  consecutiveBonus = 40;
	}
	
	// 4. Exact match bonus
	if (normalizedTarget === normalizedQuery) {
	  score += 100;
	}
	
	// Combine all scoring factors
	score = score * completeness + adjacencyBonus + consecutiveBonus;
	
	// Bonus for shorter targets (more relevant matches)
	score += Math.max(0, 20 - (normalizedTarget.length - normalizedQuery.length) / 2);
	
	return {target, score, matches};
};

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