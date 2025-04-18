import {Message, type MessageId} from "./message";
import * as openrouter from "./provider/openrouter";
import * as png from "./png";
import type {BunFile} from "bun";
import path from "path";
import {CHAR_AVATAR_DIR} from "./main";
import {characterToV2} from "./taverncard";

export type TavernCharacterData = {
	nickname: string;
	description: string;
	notes: string;
	author: string;
	version: string;
	greetings: Array<string>;
};

export type TavernCharacterDataHead = {
	notes: string;
};

export type TavernCharacterHead = {
	id: string;
	name: string;
	data: TavernCharacterDataHead;
};

export class TavernCharacter {
	id: string;
	name: string;
	data: TavernCharacterData;

	constructor() {
		this.id = `character_${Date.now()}`;
		this.name = "";
		this.data = {
			nickname: "",
			description: "",
			notes: "",
			author: "",
			version: "0.0.0",
			greetings: [],
		};
	}

	private static constructCharacter(props: {id: string; name: string; data: TavernCharacterData}): TavernCharacter {
		const character = new TavernCharacter();
		character.id = props.id;
		character.name = props.name;
		character.data = props.data;
		return character;
	}

	public head(): TavernCharacterHead {
		return {
			id: this.id,
			name: this.name,
			data: {
				notes: this.data.notes,
			},
		};
	}

	public avatar(): BunFile {
		return Bun.file(path.join(CHAR_AVATAR_DIR, this.id + ".png"));
	}

	static fromJSON(json: any): TavernCharacter {
		// Check properties
		if (json.id === undefined || typeof json.id !== "string") {
			throw new Error("Missing or invalid character id");
		}
		if (json.name === undefined || typeof json.name !== "string") {
			throw new Error("Missing or invalid character name");
		}
		if (json.data === undefined || typeof json.data !== "object") {
			throw new Error("Missing or invalid character data");
		}

		// Validate TavernCharacterData fields
		const requiredDataFields: (keyof TavernCharacterData)[] = [
			"nickname",
			"description",
			"notes",
			"author",
			"version",
		];

		for (const field of requiredDataFields) {
			if (field in json.data === false || typeof json.data[field] !== "string") {
				throw new Error(`Missing or invalid character data field: ${field}`);
			}
		}

		return TavernCharacter.constructCharacter({
			id: json.id,
			name: json.name,
			data: json.data as TavernCharacterData,
		});
	}

	encodeIntoPNG(maybePng: ArrayBuffer): ArrayBuffer {
		const jsonString = this.encodeIntoV2Json();
		// TODO: remove this when importing characters with invariants is implemented
		maybePng = png.removeNonEssentialChunks(maybePng);
		// turns out 'chara' isn't capitalised
		return png.addTextChunk(maybePng, "chara", jsonString);
	}

	encodeIntoV2Json(): string {
		const chara = characterToV2(this);
		return JSON.stringify(chara);
	}
}
