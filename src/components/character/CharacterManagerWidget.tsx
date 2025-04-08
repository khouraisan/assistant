/* @refresh reload */

import {
	createComputed,
	createEffect,
	createReaction,
	createResource,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
	untrack,
} from "solid-js";
import * as server from "../../server.ts";
import {useWs} from "../../wsContext.ts";
import {useWidgetContext} from "../Widget.tsx";
import {Portal} from "solid-js/web";
import {deepEquals, getUpdatedProperties, isSelectingSelf} from "../../util.ts";
import Button from "../Button.tsx";
import "./CharacterManagerWidget.css";
import {FaSolidFloppyDisk, FaSolidRotateLeft, FaSolidTrashCan} from "solid-icons/fa";
import {createStore, reconcile} from "solid-js/store";
import {trackStore} from "@solid-primitives/deep";
import {NotifyMessage} from "../hooks/useWs.tsx";
import {NeatInputarea} from "./NeatInputArea.tsx";

export function CharacterManagerWidget() {
	const widgetCtx = useWidgetContext();
	widgetCtx.setDrawerSize("small");

	const {registerNotifyHandler, removeNotifyCallback, connect, registerReconnectHandler} = useWs()!;
	connect();

	const [characters, {refetch: refetchCharacters}] = createResource(
		async () => {
			return (await server.loadCharacters()) ?? [];
		},
		{initialValue: []}
	);

	registerReconnectHandler(() => refetchCharacters());

	// I think this gets removed if the socket reopens
	// upd: should not be the case anymore

	const notifyHandler = (msg: NotifyMessage) => {
		console.log("notify", msg);
		if (msg.type === "notify_charactersUpdated") {
			console.log("updated");
			refetchCharacters();
		}
	};

	registerNotifyHandler(notifyHandler);
	onCleanup(() => removeNotifyCallback(notifyHandler));

	const [pickedId, setPickedId] = createSignal<string | null>(null);

	const onPick = (id: server.TavernCharacterHead["id"]) => {
		setPickedId(id);
		widgetCtx.setShowDrawer(false);
	};

	return (
		<div
			classList={{
				"character-manager-widget": true,
			}}
		>
			<CharacterEditor currentCharacterId={pickedId()} />
			<Portal mount={widgetCtx.drawer()}>
				<Drawer characters={characters()} onPick={onPick} />
			</Portal>
		</div>
	);
}

function Drawer(props: {characters: server.TavernCharacterHead[]; onPick: (id: string) => void}) {
	return (
		<div class="character-manager-drawer">
			<CharacterPicker characters={props.characters} onPick={(id) => props.onPick(id)} />
		</div>
	);
}

function CharacterPicker(props: {characters: server.TavernCharacterHead[]; onPick: (id: string) => void}) {
	const handleClick = (id: string, li: HTMLLIElement) => {
		if (isSelectingSelf(li)) return;

		props.onPick(id);
	};

	return (
		<ul class="character-list">
			<For each={props.characters}>
				{(character) => <CharacterLi character={character} onClick={(v, li) => handleClick(v, li)} />}
			</For>
		</ul>
	);
}

function CharacterLi(props: {
	character: server.TavernCharacterHead;
	onClick: (id: server.TavernCharacterHead["id"], liEl: HTMLLIElement) => void;
}) {
	let liRef: HTMLLIElement;

	return (
		<li ref={liRef!} class="character-list-item">
			<Button color="secondary" onClick={() => props.onClick(props.character.id, liRef!)}>
				<img src={server.getCharacterAvatarUrl(props.character.id)} alt={props.character.name} />
				<header>
					<h3 title={props.character.id}>{props.character.name}</h3>
				</header>
				<footer>
					<Button
						stopPropagation
						title="Delete character (hold)"
						timed={500}
						color="primary"
						class="delete-button"
						onClick={() => {
							// liRef!.classList.add("deleting");
							// props.onDelete();
						}}
					>
						<FaSolidTrashCan size={"1.1rem"} />
					</Button>
				</footer>
			</Button>
		</li>
	);
}

const myUnwrap = <T,>(obj: T): T => {
	// solidjs/unwrap doesn't remove proxies for some reason!!!
	return JSON.parse(JSON.stringify(obj));
};

function CharacterEditor(props: {currentCharacterId: string | null}) {
	let mounted = false;

	const [character, {refetch, mutate: setCharacter}] = createResource(
		() => props.currentCharacterId,
		async (id) => {
			return server.loadCharacter(id, true);
		},
		{initialValue: null}
	);

	const [unsavedCharacter, setUnsavedCharacter] = createStore<server.TavernCharacter>(server.defaultCharacter());

	const characterChanged = () => {
		return !deepEquals(unsavedCharacter, character());
	};

	createComputed(() => {
		const c = character();
		console.log("character", c);
		if (!c) return;
		setUnsavedCharacter(reconcile(c));
	});

	let characterDiff = {};

	// Find which settings have changed
	createEffect((oldData) => {
		const newData = myUnwrap(trackStore(unsavedCharacter));

		if (mounted && untrack(() => character() !== null)) {
			const partial = getUpdatedProperties(oldData as server.TavernCharacter, newData);

			// setSettingsDebounced(props.chatId, partial as any);
			characterDiff = {...characterDiff, ...partial};
		}

		return myUnwrap(unsavedCharacter);
	}, unsavedCharacter);

	onMount(() => (mounted = true));

	return (
		<Show when={character() !== null} fallback={<h2>Select a character</h2>}>
			<div class="character-editor">
				<header>
					<Button
						disabled={!characterChanged()}
						timed={500}
						color="secondary"
						onClick={() => {}}
						class="save-character"
						title="Revert changes"
					>
						<FaSolidRotateLeft size={"1.66rem"} />
					</Button>
					<Button
						timed={500}
						color="secondary"
						onClick={() => {}}
						class="save-character"
						title="Save character"
					>
						<FaSolidFloppyDisk size={"1.66rem"} />
					</Button>
				</header>
				<section class="character-editor-top">
					<div class="avatar-editor">
						<img src={server.getCharacterAvatarUrl(unsavedCharacter.id)} alt={unsavedCharacter.name} />
						<Button onClick={() => {}}>Update</Button>
					</div>
					<section class="character-editor-top-fields">
						<div class="name-nickname">
							<input
								class="name-editor"
								placeholder="Name"
								value={unsavedCharacter.name}
								onInput={(e) => setUnsavedCharacter("name", e.currentTarget.value)}
							/>
							<input
								class="nickname-editor"
								placeholder="Nickname"
								value={unsavedCharacter.data.nickname}
								onInput={(e) => setUnsavedCharacter("data", "nickname", e.currentTarget.value)}
							/>
						</div>
						<input class="author-editor" placeholder="Author" value={unsavedCharacter.data.author} />
						<input class="version-editor" placeholder="0.0.0" value={unsavedCharacter.data.version} />
						<textarea
							class="notes-editor"
							placeholder="Author's notes"
							value={unsavedCharacter.data.notes}
						/>
					</section>
				</section>
				{/* <textarea
					class="description-editor"
					placeholder="Character description"
					value={unsavedCharacter.data.description}
				/> */}
				<NeatInputarea
					placeholder="Character description"
					value={unsavedCharacter.data.description}
					onInput={(v) => setUnsavedCharacter("data", "description", v)}
				/>
			</div>
		</Show>
	);
}
