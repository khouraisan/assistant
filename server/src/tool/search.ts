import {JSDOM} from "jsdom";
import TurndownService from "turndown";
import {Tool} from "./tool";
import {Readability} from "@mozilla/readability";
import createDOMPurify from "dompurify";

const DOMPurify = createDOMPurify(new JSDOM("").window);

export class SearchTool extends Tool {
	constructor() {
		super("search_duckduckgo", "Search DuckDuckGo for a given query and return the first two results in markdown format.");
	}

	public definition(): Record<string, unknown> {
		return {
			type: "function",
			function: {
				name: "search_duckduckgo",
				description: "Search DuckDuckGo for a given query and return the first two results in markdown format.",
				parameters: {
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "The search query to use.",
						},
					},
					required: ["query"],
				},
			},
		};
	}

	// todo: add error handling
	public async call(input: Record<string, unknown>): Promise<string> {
		const query = input.query as string;
		const results = await searchDuckDuckGo(query);

		return Object.values(results).join("\n\n---\n\n");
	}
}

async function searchDuckDuckGo(query: string): Promise<{[title: string]: string}> {
	// Fetch search results from DuckDuckGo's lite interface
	const data = await fetchAsLynx(`https://lite.duckduckgo.com/lite/?q=${query}&s=0`);

	// Parse the HTML and extract result URLs
	const parsed = new JSDOM(data);
	const results = Array.from(parsed.window.document.querySelectorAll("a.result-link")).map(
		// Extract the actual URL from DuckDuckGo's redirect links
		(v) => new URL(v.getAttribute("href")!, "https://example.com").searchParams.get("uddg") ?? v.getAttribute("href")!
	);

	// Fetch and convert the first two results to markdown
	const pages = await Promise.all(
		results.slice(0, 2).map(async (url) => {
			const html = await fetchAsLynx(url);
			return pageToMarkdown(html, url);
		})
	);

	// console.log("Results:", results);
	// console.log("Pages:", pages);

	return Object.assign({}, ...pages);
}

async function fetchAsLynx(url: string): Promise<string> {
	const response = await fetch(url, {
		method: "GET",
		headers: {
			"User-Agent": "Lynx/2.8.6rel.5 libwww-FM/2.14",
			Accept: "text/html",
		},
	});

	const data = await response.text();

	return data;
}

async function pageToMarkdown(html: string, url: string): Promise<{[title: string]: string}> {
	const jsdom = new JSDOM(html).window.document;

	const readable = DOMPurify.sanitize(mainContentHeuristic(jsdom));

	const t = new TurndownService({codeBlockStyle: "fenced"});
	const md = t.turndown(readable);

	return {
		[url]: `\
# Title: ${jsdom.title}
# URL: ${url}

# Content:
<content>
${md}
</content>`,
	};
}

function mainContentHeuristic(dom: Document): string {
	const main = dom.documentElement.querySelector("main");
	if (main !== null) {
		const v = main as HTMLElement;
		// guuh
		const element = [...v.childNodes!]
			.map((v) => [v.textContent!, v] as const)
			.toSorted(([a], [b]) => b.length - a.length)[0]![1]!;
		// @ts-ignore
		if (element["outerHTML"] !== undefined) {
			// @ts-expect-error
			return element["outerHTML"];
		}
		// @ts-ignore
		if (element["innerText"] !== undefined) {
			// @ts-ignore
			return element["innerText"];
		}

		return dom.body.innerHTML;
	} else {
		const readable = new Readability(dom).parse()!.content!;
		return readable;
	}
}

const tools = [
	{
		type: "function",
		function: {
			name: "search_duckduckgo",
			description: "Search DuckDuckGo for a given query and return the first two results in markdown format.",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "The search query to use.",
					},
				},
				required: ["query"],
			},
		},
	},
];

if (import.meta.main) {
	// const results = await searchDuckDuckGo("remilia scarlet");
	// console.log("Search Results:", results);

	const messages: any[] = [
		{
			role: "user",
			content: "What characters are in Touhou 20?",
		},
	];

	const data = await callLLM(messages);

	console.log("Response:");
	console.dir(data, {depth: null});

	messages.push(data.choices[0].message);

	if (data.choices[0].message.tool_calls) {
		for (const call of data.choices[0].message.tool_calls) {
			if (call.function.name === "search_duckduckgo") {
				const query = JSON.parse(call.function.arguments).query;

				console.log("Searching for:", query);

				const results = await searchDuckDuckGo(query);

				messages.push({
					role: "tool",
					toolCallId: call.id,
					name: call.function.name,
					content: JSON.stringify(results),
				});
			}
		}
	}

	{
		const response = await callLLM(messages);

		console.log("Response:");
		console.dir(response, {depth: null});

		messages.push(response.choices[0].message);
	}
	messages.push({
		role: "user",
		content: "Tell me more about this.",
	});

	{
		const response = await callLLM(messages);

		console.log("Response:");
		console.dir(response.choices[0].message, {depth: null});
	}

	await Bun.write("./tooluse.json", JSON.stringify(messages, null, 4));
}

async function callLLM(messages: any[]) {
	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${Bun.env.OPENROUTER_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "anthropic/claude-3.7-sonnet",
			tools,
			messages,
			provider: {
				order: ["Google"],
			},
		}),
	});

	return await response.json();
}
