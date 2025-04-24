import {createStore, SetStoreFunction} from "solid-js/store";
import "./ChatPromptSettings.css";
import {createComputed, createEffect, createRenderEffect, createSignal, For, on, onCleanup, onMount, Show} from "solid-js";
import {createOptions, Select} from "@thisbeyond/solid-select";
import Sortable from "sortablejs";
import {trackStore} from "@solid-primitives/deep";

type Snippet = {
	id: SnippetId;
	name: string;
	content: string;
	children: SnippetId[];
};

type StructureSnippet = Snippet & {nestable: boolean};

type SnippetId = number;

function emptySnippet(): Snippet {
	return {
		id: 0,
		name: "",
		content: "",
		children: [],
	};
}

function isNestable(snippet: Snippet): boolean {
	const match = snippet.content.match(/{{children}}/g);
	return match !== null && match.length === 1;
}

export function ChatPromptSettings() {
	const [snippets, setSnippets] = createStore<Snippet[]>([
		{
			id: 0,
			name: "test 1",
			content: "test 1 content",
			children: [],
		},
		{
			id: 1,
			name: "test 2",
			content: "test 2 content",
			children: [],
		},
	]);
	const [currentSnippetId, setCurrentSnippetId] = createSignal<SnippetId | null>(null);

	const currentSnippet = () => snippets.find((s) => s.id === currentSnippetId()) ?? null;
	// @ts-expect-error: Not assignable
	const setCurrentSnippet: SetStoreFunction<Snippet> = (...args: [any]) => setSnippets((v) => v.id === currentSnippetId(), ...args);

	const [prompt, setPrompt] = createSignal<SnippetId[]>([]);

	const addSnippet = (id: SnippetId) => {
		setPrompt((v) => [...v, id]);
	};

	const structureSnippets = () => snippets.map((v) => ({...v, nestable: isNestable(v)}) satisfies StructureSnippet);

	return (
		<div class="chat-prompt-settings">
			<SnippetPicker snippets={snippets} setSnippetId={setCurrentSnippetId} />
			<SnippetEditor
				disabled={currentSnippetId() === null}
				canAdd={prompt().find((id) => id === currentSnippetId()) === undefined}
				snippet={currentSnippet() ?? emptySnippet()}
				setSnippet={setCurrentSnippet}
				addSnippet={addSnippet}
			/>
			<PromptStructure snippets={structureSnippets()} prompt={prompt()} />
		</div>
	);
}

// const myUnwrap = <T,>(obj: T): T => {
// 	// solidjs/unwrap doesn't remove proxies for some reason!!!
// 	return JSON.parse(JSON.stringify(obj));
// };

function SnippetPicker(props: {snippets: Snippet[]; setSnippetId: SetStoreFunction<SnippetId | null>}) {
	const opts = createOptions(() => props.snippets, {format: (v) => v.name});

	return (
		<section class="snippet-picker">
			<Select {...opts} onChange={(v: Snippet) => props.setSnippetId(v.id)} />
		</section>
	);
}

function SnippetEditor(props: {
	disabled: boolean;
	canAdd: boolean;
	snippet: Snippet;
	setSnippet: SetStoreFunction<Snippet>;
	addSnippet: (id: SnippetId) => void;
}) {
	const [unsavedSnippet, setUnsavedSnippet] = createStore(props.snippet);

	createComputed(() => {
		void props.snippet.id;
		void props.disabled;

		setUnsavedSnippet(props.snippet);
	});

	const snippetChanged = () => {
		const a = JSON.stringify(unsavedSnippet);
		const b = JSON.stringify(props.snippet);
		return a !== b;
	};

	return (
		<>
			<section
				classList={{
					"snippet-editor": true,
					unsaved: snippetChanged(),
				}}
			>
				<h1>Snippet editor</h1>
				<input
					type="text"
					placeholder="Snippet name"
					value={unsavedSnippet.name}
					onInput={(e) => setUnsavedSnippet("name", e.currentTarget.value)}
					disabled={props.disabled}
				/>
				<textarea
					placeholder="Snippet content"
					disabled={props.disabled}
					value={unsavedSnippet.content}
					onInput={(e) => setUnsavedSnippet("content", e.currentTarget.value)}
				/>
				<div class="snippet-editor-buttons">
					<button
						class="save-snippet"
						onClick={() => props.setSnippet(unsavedSnippet)}
						disabled={props.disabled || !snippetChanged()}
					>
						Save
					</button>
					<button
						class="discard-changes"
						onClick={() => setUnsavedSnippet(props.snippet)}
						disabled={props.disabled || !snippetChanged()}
					>
						Revert
					</button>
					<button
						class="add-snippet"
						onClick={() => props.addSnippet(props.snippet.id)}
						disabled={!props.canAdd || props.disabled || snippetChanged()}
					>
						Add
					</button>
				</div>
			</section>
		</>
	);
}

function PromptStructure(props: {snippets: StructureSnippet[]; prompt: SnippetId[]}) {
	let listRef: HTMLOListElement;

	let sortables: Sortable[] = [];
	createEffect(
		on(
			() => {
				void props.snippets;
				return props.prompt;
			},
			(prompt) => {
				sortables.forEach((v) => v.destroy());
				sortables = [];

				const a = [];
				// TODO: removing {{children}} from a snippet that has children is still buggy
				// tbh i should just add a short timeout and forget about this all
				const isPretty = document.querySelector(".pretty") !== null;
				for (const ol of [...listRef!.querySelectorAll("ol"), listRef!]) {
					a.push(ol.isConnected);
					sortables.push(
						new Sortable(ol, {
							group: "nested",
							animation: isPretty ? 67 : 0,
							fallbackOnBody: true,
							swapThreshold: 0.65,
							onEnd: (ev) => {
								console.log("end", {
									item: ev.item,
									to: ev.to,
									from: ev.from,
									oldIndex: ev.oldIndex,
									newIndex: ev.newIndex,
									oldDraggableIndex: ev.oldDraggableIndex,
									newDraggableIndex: ev.newDraggableIndex,
									clone: ev.clone,
									pullMod: ev.pullMode,
								});
							},
						})
					);
				}

				console.log("sort attached", sortables, a);
			}
		)
	);

	onCleanup(() => sortables.forEach((v) => v.destroy()));

	const [rerender, setRerender] = createSignal(true);
	const rerenderList = async () => {
		setRerender(false);
		return new Promise<void>((r) => setTimeout(() => (setRerender(true), r()), 0));
	};

	return (
		<section class="prompt-structure">
			<h1>Prompt structure</h1>
			<ol ref={listRef!}>
				{/*  */}
				<Show when={rerender()}>
					<For each={props.prompt}>
						{(id) => {
							// Function for reactivity
							const snippet = () => props.snippets.find((s) => s.id === id);

							createRenderEffect(() => {
								if (!snippet()) throw new Error(`Snippet ${id} not found`);
							});

							// Rerender the whole list if one of the items is not nestable anymore
							// In case the changed item had children
							createRenderEffect((old) => {
								const nestable = snippet()!.nestable;
								if (old === true && nestable === false) rerenderList();
								return nestable;
							}, snippet()!.nestable);

							return (
								<li
									classList={{
										nestable: snippet()!.nestable,
									}}
								>
									{snippet()!.name}
									<Show when={snippet()!.nestable}>
										<ol />
									</Show>
								</li>
							);
						}}
					</For>
				</Show>
			</ol>
		</section>
	);
}
