import {unified} from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkGfm from "remark-gfm";
import rehypeStringify from "rehype-stringify";
import {visit, SKIP} from "unist-util-visit";
import {toString} from "mdast-util-to-string";
import {h} from "hastscript";
import rehypeRaw from "rehype-raw";
import {FaSolidArrowDown, FaSolidArrowUp, FaSolidClipboard} from "solid-icons/fa";

// Custom plugin to handle quotes in the Markdown AST
function remarkCustomQuotes() {
	return (tree: any) => {
		// Keep track of whether we're inside a code block
		let inQuote = false;
		let segments = [];

		// Second pass: Process text nodes to find quotes
		visit(tree, "text", (node, index, parent) => {
			// console.log("visit", {type: node.type, value: node.value, inQuote});

			const text = node.value;

			segments.length = 0;

			let currentSegment = "";

			for (let i = 0; i < text.length; i++) {
				const char = text[i];

				if (char === '"') {
					// If we have content in the current segment, add it
					if (currentSegment) {
						if (inQuote) {
							segments.push({
								type: "quote",
								value: '"' + currentSegment + '"',
							});
						} else {
							segments.push({
								type: "text",
								value: currentSegment,
							});
						}
						currentSegment = "";
					}
					inQuote = !inQuote;
				} else {
					// Handle end of quote by newlines
					if (inQuote && char === "\n" && text[i + 1] === "\n") {
						segments.push({
							type: "quote",
							value: '"' + currentSegment + '"',
						});

						currentSegment = char;
						inQuote = true;
					} else {
						currentSegment += char;
					}
				}
			}

			// Add any remaining content
			if (currentSegment) {
				if (inQuote) {
					segments.push({
						type: "quote",
						value: '"' + currentSegment + '"',
					});
				} else {
					segments.push({
						type: "text",
						value: currentSegment,
					});
				}
			}

			// Replace the current node with our processed segments
			const newNodes = segments.map((segment) => {
				if (segment.type === "text") {
					return {type: "text", value: segment.value};
				} else {
					// Create a custom node for quotes
					return {
						type: "customQuote",
						data: {hName: "q"},
						children: [{type: "text", value: segment.value}],
					};
				}
			});

			parent.children.splice(index, 1, ...newNodes);

			return;
		});
	};
}

// Custom plugin to handle links (similar to your renderer customization)
function rehypeTargetBlankLinks() {
	return (tree: any) => {
		visit(tree, "element", (node) => {
			if (node.tagName === "a") {
				node.properties = node.properties || {};
				node.properties.target = "_blank";
				node.properties.rel = "noopener noreferrer";
			}
		});
	};
}

// Custom plugin to enhance code blocks with headers and styling
function rehypeCodeBlocks() {
	return (tree: any) => {
		visit(tree, "element", (node) => {
			// Check if this is a code block
			if (node.tagName === "pre" && node.children.length === 1 && node.children[0].tagName === "code") {
				const codeNode = node.children[0];

				// Get the language from the class
				let language = "text";
				if (codeNode.properties && codeNode.properties.className) {
					const langClass = codeNode.properties.className.find(
						(cls: string) => typeof cls === "string" && cls.startsWith("language-")
					);
					if (langClass) {
						language = langClass.slice(9);
					}
				}

				// Create the header element
				const headerNode = {
					type: "element",
					tagName: "div",
					properties: {className: ["code-header"]},
					children: [
						// Language label
						{
							type: "element",
							tagName: "h5",
							properties: {},
							children: [{type: "text", value: language}],
						},
						// Buttons container
						{
							type: "element",
							tagName: "div",
							properties: {},
							children: [
								// Copy button
								{
									type: "element",
									tagName: "button",
									properties: {
										className: ["copy-button"],
										title: "Copy code",
									},
									children: [
										{
											type: "raw",
											value: document.getElementById("_FaSolidClipboard")?.outerHTML,
										},
									],
								},
								// Expand button
								{
									type: "element",
									tagName: "button",
									properties: {className: ["expand-button"]},
									children: [
										// Collapse icon
										{
											type: "element",
											tagName: "div",
											properties: {title: "Collapse code block"},
											children: [
												{
													type: "raw",
													value: document.getElementById("_FaSolidArrowUp")?.outerHTML,
												},
											],
										},
										// Expand icon
										{
											type: "element",
											tagName: "div",
											properties: {title: "Expand code block"},
											children: [
												{
													type: "raw",
													value: document.getElementById("_FaSolidArrowDown")?.outerHTML,
												},
											],
										},
									],
								},
							],
						},
					],
				};

				// Add the header before the code element
				node.children.unshift(headerNode);

				// Add a class to the pre element for styling
				node.properties = node.properties || {};
				node.properties.className = node.properties.className || [];
				node.properties.className.push("code-block-container");
			}
		});
	};
}

// Process the markdown using the unified ecosystem
const processor = unified()
	.use(remarkParse) // Parse markdown to mdast
	.use(remarkCustomQuotes) // Apply our custom quotes handling
	.use(remarkRehype, {
		allowDangerousHtml: true, // Allow HTML in markdown
	}) // Convert mdast to hast
	.use(rehypeTargetBlankLinks) // Add target="_blank" to links
	.use(rehypeCodeBlocks) // Add styling to code blocks
	.use(rehypeRaw) // Parse the preserved HTML
	.use(rehypeStringify); // Convert hast to HTML string

// Main function to compile markdown to HTML
export function compileMarkdownNew(text: string): string {
	// Handle HTML tags in the input by escaping quotes within tags
	// This mimics your approach of replacing quotes in HTML tags
	const preprocessedText = text.replace(/<([^>]+?)>/g, (_, tagContent) => `<${tagContent.replace(/"/g, "\uffff")}>`);

	const result = processor.processSync(preprocessedText);

	// Restore any escaped quotes in HTML tags
	let html = result.toString();
	html = html.replace(/\uffff/g, '"');

	return html;
}
