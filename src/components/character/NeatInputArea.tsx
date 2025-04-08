import {createEffect, createRenderEffect, createSignal, For, JSX, Match, onMount, Switch} from "solid-js";
import "./NeatInputArea.css";

type NeatInputAreaToken = [string, ("quote" | "italic" | "bold" | "macro")[]];

export function NeatInputarea(props: {
	placeholder?: string;
	value: string;
	onInput: (newContent: string) => void;
	onSubmit?: () => void;
	ref?: JSX.IntrinsicAttributes["ref"];
	disabled?: boolean;
	disabledFlash?: boolean;
}) {
	// const splitText = (input: string): NeatInputAreaToken[] => {
	// 	const quoted = input.split(/(".*?")/).map((v) => {
	// 		return [v, v.startsWith('"') && v.endsWith('"') ? ["quote" as const] : []] satisfies NeatInputAreaToken;
	// 	});
	// 	const italics = quoted
	// 		.map(([v, tags]) => {
	// 			return v.split(/(\*.*?\*)/).map((m) => {
	// 				return [
	// 					m,
	// 					m.startsWith("*") && m.endsWith("*") ? [...tags, "italic" as const] : tags,
	// 				] satisfies NeatInputAreaToken;
	// 			});
	// 		})
	// 		.flat();
	// 	const macros = italics
	// 		.map(([v, tags]) => {
	// 			return v.split(/({{.*?}})/).map((m) => {
	// 				return [
	// 					m,
	// 					m.startsWith("{{") && m.endsWith("}}") ? [...tags, "macro" as const] : tags,
	// 				] satisfies NeatInputAreaToken;
	// 			});
	// 		})
	// 		.flat();

	// 	return macros.filter(([v]) => v !== "");
	// };

	const splitText = (input: string): NeatInputAreaToken[] => {
		const quoted = input.split(/(".*?")/).map((v) => {
			return [v, v.startsWith('"') && v.endsWith('"') ? ["quote" as const] : []] satisfies NeatInputAreaToken;
		});

		// Handle bold italic (***text***) first to avoid conflicts with italic and bold
		const boldItalics = quoted
			.map(([v, tags]) => {
				return v.split(/(\*\*\*.*?\*\*\*)/).map((m) => {
					return [
						m,
						m.startsWith("***") && m.endsWith("***") ? [...tags, "bold" as const, "italic" as const] : tags,
					] satisfies NeatInputAreaToken;
				});
			})
			.flat();

		// Handle bold (**text**)
		const bolds = boldItalics
			.map(([v, tags]) => {
				return v.split(/(\*\*.*?\*\*)/).map((m) => {
					return [
						m,
						m.startsWith("**") && m.endsWith("**") && !m.startsWith("***")
							? [...tags, "bold" as const]
							: tags,
					] satisfies NeatInputAreaToken;
				});
			})
			.flat();

		// Handle italic (*text*)
		const italics = bolds
			.map(([v, tags]) => {
				return v.split(/(\*[^\*].*?[^\*]\*)/).map((m) => {
					return [
						m,
						m.startsWith("*") && m.endsWith("*") && !m.startsWith("**")
							? [...tags, "italic" as const]
							: tags,
					] satisfies NeatInputAreaToken;
				});
			})
			.flat();

		const macros = italics
			.map(([v, tags]) => {
				return v.split(/({{.*?}})/).map((m) => {
					return [
						m,
						m.startsWith("{{") && m.endsWith("}}") ? [...tags, "macro" as const] : tags,
					] satisfies NeatInputAreaToken;
				});
			})
			.flat();

		return macros.filter(([v]) => v !== "");
	};

	const tokens = () => splitText(props.value);

	// used to prevent disabled flash from happening on initial render as disabled.
	const [enabledOnce, setEnabledOnce] = createSignal(false);
	createRenderEffect(() => {
		if (!props.disabled) setEnabledOnce(true);
	});

	return (
		<div class="neat-input-area">
			<div
				classList={{
					"neat-input": true,
					"disabled-flash": props.disabledFlash || undefined,
					"enabled-once": enabledOnce(),
				}}
				data-disabled={props.disabled || undefined}
			>
				<textarea
					disabled={props.disabled}
					ref={props.ref as any}
					value={props.value}
					onKeyDown={(ev) => {
						if (props.onSubmit !== undefined && ev.key === "Enter" && ev.ctrlKey) {
							ev.preventDefault();
							props.onSubmit();
						}
					}}
					onInput={(ev) => {
						ev.currentTarget.scrollTop = 0;
						props.onInput(ev.currentTarget.value);
						// console.log(JSON.stringify(ev.currentTarget.value), tokens());
					}}
				></textarea>
				<div class="neat-input-mask" data-placeholder={props.placeholder}>
					<For each={tokens()}>
						{(part, i) => <TextPart token={part} isLast={tokens().length - 1 === i()} />}
					</For>
				</div>
			</div>
		</div>
	);
}

function TextPart(props: {token: NeatInputAreaToken; isLast: boolean}) {
	const text = () => props.token[0];
	const fixedText = () => {
		// browsers trim the last newline no matter fucking what so this is a workaround
		const t = text();
		if (props.isLast && t.endsWith("\n")) return t + "\n";
		return t;
	};
	const tags = () => props.token[1];

	const makeClassList = () => ({
		"neat-quote": tags().includes("quote"),
		"neat-macro": tags().includes("macro"),
		"neat-italic": tags().includes("italic"),
		"neat-bold": tags().includes("bold"),
	});

	let spanRef: HTMLSpanElement;

	const isMacro = () => props.token[1].includes("macro");
	const macro = () => (isMacro() ? text() : undefined);

	// workaround for parentElement being null before mount
	const [macroStyle, setMacroStyle] = createSignal<JSX.CSSProperties | undefined>(undefined);
	onMount(() => {
		if (isMacro())
			setMacroStyle({
				"--macro": `"${text().slice(2, -2)}"`,
				width: `${measureTextPxWidth(text(), spanRef!.parentElement!)}px`,
			});
	});

	// createEffect(() => console.log("macro style", macroStyle()));
	// createRenderEffect(() => console.log("parent node", test()));

	return (
		<span classList={makeClassList()} data-macro={macro()} style={macroStyle()} ref={spanRef!}>
			<Switch fallback={<span>{fixedText()}</span>}>
				<Match when={isMacro()}>
					{
						<>
							<span>{"{{"}</span>
							<span class="macro-value" />
							<span>{"}}"}</span>
						</>
					}
				</Match>
			</Switch>
		</span>
	);
}

function measureTextPxWidth(text: string, inElement: HTMLElement) {
	// cloneNode make this not work
	const parent = inElement; //inElement.cloneNode() as HTMLElement;
	const el = document.createElement("span");
	el.style.setProperty("position", "absolute", "important");
	el.style.setProperty("visibility", "hidden", "important");
	// Prevent wrapping if the text is wider than the screen.
	el.style.setProperty("white-space", "nowrap", "important");
	el.style.setProperty("width", "max-content", "important");
	el.innerText = text;

	parent.appendChild(el);
	const {width} = el.getBoundingClientRect();
	parent.removeChild(el);
	return width;
}
