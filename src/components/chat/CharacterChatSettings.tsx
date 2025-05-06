import {createStore, SetStoreFunction} from "solid-js/store";
import "./CharacterChatSettings.css";
import {createComputed, createEffect, createRenderEffect, createResource, createSignal, For} from "solid-js";
import {createOptions, Select} from "@thisbeyond/solid-select";
import {isSelectingSelf} from "../../util";
import Button from "../Button";
import * as server from "../../server";

type PresetId = number;

type Preset = {
	id: PresetId;
	name: string;
};

export function CharacterChatSettings(props: {}) {
	const [characters] = createResource<server.TavernCharacterHead[]>(server.loadCharacters, {
		initialValue: [],
	});

	const [presets, setPresets] = createStore<Preset[]>([
		{id: 0, name: "test 1"},
		{id: 1, name: "test 2"},
	]);
	const [currentPresetId, setCurrentPresetId] = createSignal<PresetId | null>(null);

	const currentPreset = () => presets.find((s) => s.id === currentPresetId()) ?? null;

	// @ts-expect-error: Not assignable
	// TODO: i dont know if this function is correct tbh
	const setCurrentPreset: SetStoreFunction<Preset> = (...args: [any]) => setPresets((v) => v.id === currentPresetId(), ...args);

	const [pickedCharacters, setPickedCharacters] = createSignal<server.TavernCharacterHead[]>([]);

	const handlePick = (v: server.TavernCharacterHead["id"]) => {
		const character = characters().find((c) => c.id === v);
		if (!character) return;

		setPickedCharacters((prev) => [...prev, character]);
	};

	const handleUnpick = (v: server.TavernCharacterHead["id"]) => {
		setPickedCharacters((prev) => prev.filter((c) => c.id !== v));
	};

	createRenderEffect(() => {
		void pickedCharacters();

		// update backend
	});

	return (
		<div class="character-chat-settings">
			<PresetPicker presets={presets} setSnippetId={setCurrentPresetId} />
			<PickedCharacters picked={pickedCharacters()} onUnpick={handleUnpick} />
			<CharacterPicker characters={characters()} picked={pickedCharacters()} onPick={handlePick} onUnpick={handleUnpick} />
		</div>
	);
}

function PresetPicker(props: {presets: Preset[]; setSnippetId: SetStoreFunction<PresetId | null>}) {
	const opts = createOptions(() => props.presets, {format: (v) => v.name});

	return (
		<section class="preset-picker">
			<h1>Presets</h1>
			<Select {...opts} onChange={(v: Preset) => props.setSnippetId(v.id)} />
		</section>
	);
}

function CharacterPicker(props: {
	characters: server.TavernCharacterHead[];
	picked: server.TavernCharacterHead[];
	onPick: (id: string) => void;
	onUnpick: (id: string) => void;
}) {
	const handleClick = (id: string, li: HTMLLIElement) => {
		if (isSelectingSelf(li)) return;

		if (props.picked.some((c) => c.id === id)) {
			props.onUnpick(id);
		} else {
			props.onPick(id);
		}
	};

	return (
		<section
			classList={{
				"character-picker": true,
			}}
		>
			<h1>Character picker</h1>
			<div class="character-picker-list">
				<ul>
					<For each={props.characters}>
						{(character) => (
							<CharacterLi
								info={character}
								picked={props.picked.some((c) => c.id === character.id)}
								onClick={(v, li) => handleClick(v, li)}
							/>
						)}
					</For>
				</ul>
			</div>
		</section>
	);
}

function PickedCharacters(props: {picked: server.TavernCharacterHead[]; onUnpick: (id: string) => void}) {
	let listRef: HTMLOListElement;

	return (
		<section class="picked-characters">
			<h1>Picked characters</h1>
			<ul ref={listRef!}>
				<For each={props.picked}>{(info) => <CharacterLi info={info} onClick={() => props.onUnpick(info.id)} />}</For>
			</ul>
		</section>
	);
}

function CharacterLi(props: {
	info: server.TavernCharacterHead;
	onClick: (id: server.TavernCharacterHead["id"], liEl: HTMLLIElement) => void;
	picked?: boolean;
}) {
	let liRef: HTMLLIElement;

	return (
		<li
			ref={liRef!}
			classList={{
				"character-li": true,
				picked: props.picked,
			}}
		>
			<Button timed={props.picked ? 500 : undefined} onClick={(ev) => props.onClick(props.info.id, liRef!)}>
				<img src={server.getCharacterAvatarUrl(props.info.id)} alt={props.info.name} />
				<h3>{props.info.name}</h3>
			</Button>
		</li>
	);
}
