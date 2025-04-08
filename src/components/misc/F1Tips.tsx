import {createEffect, createSignal, onCleanup, Show} from "solid-js";
import {useToast} from "solid-notifications";
import "./F1Tips.css";
import * as marked from "marked";
import * as tips from "./tips";
import Button from "../Button";
import {FaSolidXmark} from "solid-icons/fa";

type MarkdownString = string;

const tipDocuments = (() => {
	const v = import.meta.glob("/src/assets/tips/*.md", {eager: true, query: "?raw"});

	return Object.fromEntries(
		Object.entries(v).map(([k, v]: any[]) => [k.split("/").at(-1)!.split(".")[0], v.default])
	) as Record<string, MarkdownString>;
})();

export function F1Tips(props: {active: boolean}) {
	return (
		<Show when={props.active}>
			<TipsInner />
		</Show>
	);
}

function TipsInner() {
	const [tipToShow, setTipToShow] = createSignal<tips.TipName | null>(null);

	const {notify} = useToast();

	let currentHover: Element | undefined = undefined;

	const handleWindowKeyDown = (ev: KeyboardEvent) => {
		if (ev.key !== "F1" || tipToShow() || currentHover === undefined) {
			return;
		}

		const closestTipElement = currentHover.closest("[data-tip]") as (Element & {dataset: DOMStringMap}) | null;

		console.log("closestTipElement", closestTipElement, currentHover);

		if (closestTipElement === null) {
			notify(`${formatNodeAsString(currentHover)} has no tip`, {type: "info"});
			return;
		}

		ev.preventDefault();

		setTipToShow(closestTipElement.dataset.tip as tips.TipName);
	};

	const handleWindowMouseOver = (ev: MouseEvent) => {
		if (ev.target instanceof Element) {
			currentHover = ev.target;
		}
	};

	document.body.addEventListener("keydown", handleWindowKeyDown);
	document.body.addEventListener("mouseover", handleWindowMouseOver, {passive: true});
	onCleanup(() => {
		document.body.removeEventListener("keydown", handleWindowKeyDown);
		document.body.removeEventListener("mouseover", handleWindowMouseOver);
	});

	return <Dialog tip={tipToShow()} onClose={() => setTipToShow(null)}></Dialog>;
}

function Dialog(props: {tip: tips.TipName | null; onClose: () => void}) {
	let dialogRef: HTMLDialogElement;

	createEffect(() => {
		if (props.tip !== null) {
			dialogRef!.showModal();
		} else {
			dialogRef!.close();
		}
	});

	const parser = markedWithHeadingAttribs();

	const html = (md: string) => parser.parse(md, {async: false});

	return (
		<dialog class="tip-dialog" onClose={() => props.onClose()} ref={dialogRef!}>
			<Show when={(props.tip !== null, props.tip)}>
				{(tip) => {
					let ref: HTMLDivElement;

					const {document, highlight} = tips.tipToDocumentPath(tip());
					console.log("tip", tip(), document, highlight);

					createEffect(() => {
						if (highlight === null) return;

						const highlightEl = ref!.querySelector(`.highlight`)!;

						const disableSelf = (ev: any) => {
							ev.currentTarget.classList.add("seen");
						};

						highlightEl.addEventListener("touchstart", disableSelf, {passive: true, once: true});
						highlightEl.addEventListener("mouseenter", disableSelf, {once: true});

						highlightEl.scrollIntoView({behavior: "smooth", block: "center"});
					});

					return (
						<>
							<DialogHeader title={document} onClose={() => props.onClose()} />
							<div
								ref={ref!}
								class="tip-dialog-content"
								innerHTML={wrapUntilH1(html(tipDocuments[document]), highlight)}
							></div>
						</>
					);
				}}
			</Show>
		</dialog>
	);
}

function DialogHeader(props: {title: string; onClose: () => void}) {
	return (
		<header class="dialog-header">
			<h2>
				<span>{props.title} tips</span>
			</h2>
			<Button
				title="Close dialog (hold)"
				color="secondary"
				class="close-button"
				onClick={() => props.onClose?.()}
			>
				<FaSolidXmark />
			</Button>
		</header>
	);
}

function formatNodeAsString(node: Element) {
	const cloned = node.cloneNode(false) as Element;
	const i = cloned.outerHTML.lastIndexOf("</");
	return cloned.outerHTML.slice(0, i);
}

function markedWithHeadingAttribs(): marked.Marked {
	const customMarked = new marked.Marked();

	const renderer = new marked.Renderer();

	renderer.heading = function ({tokens, depth, text}) {
		const title = text.replaceAll(" ", "-").toLowerCase();
		return `<h${depth} data-title="${title}">${renderer.parser.parseInline(tokens)}</h${depth}>`;
	};

	customMarked.setOptions({
		renderer: renderer,
	});

	return customMarked;
}

function wrapUntilH1(htmlString: string, dataTitle: string | null) {
	if (dataTitle === null) return htmlString;

	// Create a temporary container
	const container = document.createElement("div");
	container.innerHTML = htmlString;

	// Find the starting element
	const startElement = container.querySelector(`[data-title="${dataTitle}"]`);

	if (!startElement) return htmlString;

	// Create wrapper div
	const wrapper = document.createElement("div");
	wrapper.className = "highlight";

	// Collect elements to wrap
	let current: Element | null = startElement;

	const elementsToWrap = [];

	while (current !== null) {
		elementsToWrap.push(current);
		const next: Element | null = current.nextElementSibling;
		if (next === null || next.nodeName === "H1") break;
		current = next;
	}

	// Insert wrapper and move elements
	if (elementsToWrap.length > 0) {
		startElement.parentNode!.insertBefore(wrapper, startElement);
		for (const el of elementsToWrap) {
			wrapper.appendChild(el);
		}
	}

	return container.innerHTML;
}
