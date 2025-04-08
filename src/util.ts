export function measureText(text: string, element: HTMLElement) {
	const clone = element.cloneNode(true) as HTMLElement;
	clone.innerText = text;
	document.body.appendChild(clone);
	const {width, height} = clone.getBoundingClientRect();
	document.body.removeChild(clone);
	return {width, height};
}

export function getCaretOffset(x: number, y: number): number | null {
	if (document.caretPositionFromPoint) {
		const range = document.caretPositionFromPoint(x, y);
		if (range === null) return null;
		return range.offset;
	} else if (document.caretRangeFromPoint) {
		const range = document.caretRangeFromPoint(x, y);
		if (range === null) return null;
		return range.startOffset;
	} else {
		return null;
	}
}

export function getUpdatedProperties<T extends Record<string, any>>(oldObj: T, newObj: T): Partial<T> {
	const result: Partial<T> = {};

	for (const key in newObj) {
		if (oldObj[key] !== newObj[key]) {
			result[key as keyof T] = newObj[key];
		}
	}

	return result;
}

export function isEmptyObject(v: Record<any, any>): v is Record<never, never> {
	return Object.keys(v).length === 0;
}

export function isSelectingSelf(el: HTMLElement) {
	const selection = window.getSelection();
	return selection && el!.contains(selection.anchorNode ?? null) && selection.toString().length > 0;
}

// Gemini chan is smart I hope
export function deepEquals(a: unknown, b: unknown): boolean {
	// 1. Strict equality check handles primitives, functions, and same object references.
	if (a === b) {
		return true;
	}

	// 2. Different types or one is null/not-object (after === fails) means not equal.
	//    typeof null is 'object', so explicitly check for null.
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
		return false;
	}

	// 3. Handle Dates
	if (a instanceof Date && b instanceof Date) {
		// Compare time values. Invalid dates may need special handling if required.
		return a.getTime() === b.getTime();
	}

	// 4. Handle Regular Expressions
	if (a instanceof RegExp && b instanceof RegExp) {
		return a.source === b.source && a.flags === b.flags;
	}

	// 5. Handle Arrays
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false; // Different lengths means not equal
		}
		for (let i = 0; i < a.length; i++) {
			// Recursively compare each element
			if (!deepEquals(a[i], b[i])) {
				return false;
			}
		}
		// If all elements matched
		return true;
	}

	// 6. Handle case where one is Array, the other is not (but both are objects)
	if (Array.isArray(a) !== Array.isArray(b)) {
		return false;
	}

	// 7. Handle Objects (check keys and values recursively)
	//    Cast to Record for easier key access, assuming string keys for simplicity here.
	//    For full correctness including Symbol keys, more work is needed.
	const objA = a as Record<string, unknown>;
	const objB = b as Record<string, unknown>;

	const keysA = Object.keys(objA);
	const keysB = Object.keys(objB);

	// Check if they have the same number of own enumerable properties
	if (keysA.length !== keysB.length) {
		return false;
	}

	// Sort keys to ensure consistent comparison order, although technically
	// `hasOwnProperty` check below makes this less critical for correctness,
	// it can be slightly more efficient if keys are drastically different.
	// keysA.sort();
	// keysB.sort();
	// If sorting, check if sorted keysets are identical:
	// for (let i = 0; i < keysA.length; i++) {
	//   if (keysA[i] !== keysB[i]) return false;
	// }

	// Check if all keys in A exist in B and have deeply equal values
	for (const key of keysA) {
		// Check if B also has this key as an *own* property
		if (!Object.prototype.hasOwnProperty.call(objB, key)) {
			return false;
		}
		// Recursively compare the values associated with the key
		if (!deepEquals(objA[key], objB[key])) {
			return false;
		}
	}

	// If all checks passed, the objects are deeply equal
	return true;
}
