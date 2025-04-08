import {marked} from "marked";

(window as any).marked = marked;

{
	const renderer = new marked.Renderer();
	renderer.link = function (props) {
		let rendered = marked.Renderer.prototype.link.call(this, props);
		if (!rendered.includes('target="_blank"')) {
			rendered = rendered.replace("<a ", `<a target="_blank" rel="noopener noreferrer" `);
		}
		return rendered;
	};

	marked.use({
		renderer,
	});
}

export function compileMarkdown(text: string) {
	// this is actually the fastest way to count characters!
	let quoteCount = text.split('"').length - 1;

	const [withQuotes, {open, close}] = quotesToBlockquoteToken(text, quoteCount);
	let parsed = marked.parse(withQuotes, {async: false});

	parsed = parsed.replaceAll(open, "<q>");
	parsed = parsed.replaceAll(close, "</q>");
	// console.log("input", withQuotes, "parsed", JSON.parse(JSON.stringify(parsed)));
	return parsed;
}

// This is DUMB, but I need markdown in blockquotes
function quotesToBlockquoteToken(input: string, quoteCount: number) {
	const restoreTokenOpen = `[${Math.random()}]`;
	const restoreTokenClose = `[${Math.random()}]`;
	// I DON'T like this, but silly exactly this solution in its code grrr...
	input = input.replaceAll(/<([^>]+?)>/g, (_, cg1) => `<${cg1.replaceAll('"', "\uffff")}>`);

	let hasLastUnclosed = quoteCount % 2 === 1;
	if (hasLastUnclosed) {
		input = input + '"';
	}

	const codeBlocks = Array.from(input.matchAll(/```/g), (match) => match.index!);
	let inCodeBlock = false;
	const codeBlockRanges = codeBlocks.flatMap((start, i) => {
		if (inCodeBlock) {
			inCodeBlock = false;
			return [[start, codeBlocks[i + 1] ?? input.length]];
		} else {
			inCodeBlock = true;
			return [];
		}
	});

	input = input.replaceAll(/".*?"/gs, (match) => {
		const index = input.indexOf(match);

		if (codeBlockRanges.some(([start, end]) => index >= start && index < end)) {
			return match;
		}

		return makeCustomBlockquote(match, restoreTokenOpen, restoreTokenClose);
	});

	input = input.replaceAll("\uffff", '"');
	return [input, {open: restoreTokenOpen, close: restoreTokenClose}] as const;
}

function makeCustomBlockquote(text: string, restoreTokenOpen: string, restoreTokenClose: string) {
	const quote = document.createElement("q");
	quote.innerText = text;

	return quote.outerHTML.replaceAll("<q>", restoreTokenOpen).replaceAll("</q>", restoreTokenClose);
}
