import {createSignal} from "solid-js";

export const API_ROOT = import.meta.env.PROD ? window.location.origin : "http://localhost:3000";

export type ChatId = `chat_${number}`;

// Data format the server uses
export type ChatHead = {
	id: ChatId;
	name: string;
	messageCount: number;
	lastMessageSnippet: string | null;
	color: "none" | "red" | "green" | "yellow" | "blue" | "orange" | "purple";
	temporary: boolean;
	tokenCount: number;
};

// How chats are stored locally
export type ChatHeadRepr = ChatHead & {_fake?: boolean};

export type RequestMessage =
	| {
			role: "user";
			text: string;
			attachments: Extract<Message, {role: "user"}>["attachments"];
	  }
	| {
			role: "assistant";
			text: string;
			attachments?: never;
	  };

export type Message = {
	id: string;
	text: string;
	date: Date;
} & ({role: "user"; model?: never; attachments: Array<string>} | {role: "assistant"; model: string; attachments?: never});

export type TavernCharacter = {
	id: string;
	name: string;
	avatarUrl: string;
	data: TavernCharacterData;
};

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

export type AddMessageOp =
	| {
			type: "set" | "insert";
			position: "end" | number;
			message: RequestMessage;
	  }
	| {
			id: string;
			message: RequestMessage;
	  };

export const [serverErrors, setServerErrors] = createSignal<any[]>([]);

function logError(...args: any[]) {
	console.error(...args);
	const msg = args.map((v) => JSON.stringify(v)).join(" ");
	setServerErrors((prev) => [...prev, msg]);
}

export async function newChat(opts?: {temporary: boolean}): Promise<ChatId | null> {
	const res = await fetch(`${API_ROOT}/chats/new?temporary=${opts?.temporary ?? false}`, {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({name: "New Chat"}),
	});

	if (!res.ok) {
		return null;
	}

	return (await res.json()).chatId;
}

export async function makePermanent(chatId: ChatId): Promise<boolean> {
	if (!chatId.startsWith("chat_")) {
		logError("Invalid chat ID", chatId);
		return false;
	}

	const res = await fetch(`${API_ROOT}/chats/${chatId}/make-permanent`, {
		method: "PUT",
		headers: {"Content-Type": "application/json"},
	});

	return res.ok;
}

export async function addMessage(chatId: ChatId, op: AddMessageOp) {
	let url = `${API_ROOT}/messages/`;
	let body = {message: op.message, chatId};
	if ("type" in op) {
		url += op.type;
		(body as any)["position"] = op.position;
	} else {
		url += "set/" + op.id;
	}

	await fetch(url, {
		method: "PUT",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify(body),
	});
}

export async function loadMessages(chatId: ChatId): Promise<Message[] | null> {
	const res = await fetch(`${API_ROOT}/chats/${chatId}/messages`, {
		headers: {"Content-Type": "application/json"},
	});

	let messageArray = await res.json();

	if (!res.ok) {
		return null;
	}

	return messageArray.map(reviveMessage);
}

export async function loadChats(): Promise<ChatHead[]> {
	const full = false;
	const res = await fetch(`${API_ROOT}/chats?full=` + full.toString());

	if (!res.ok) {
		logError("Failed to load chats");
		return [];
	}

	return await res.json();
}

export async function loadChat(chatId: ChatId, full: boolean): Promise<ChatHead | null> {
	const res = await fetch(`${API_ROOT}/chats/${chatId}?full=` + full.toString());

	if (!res.ok) {
		logError("Failed to load chat");
		return null;
	}

	return await res.json();
}

export async function deleteChat(chatId: ChatId): Promise<boolean> {
	console.log("Deleting chat", chatId);
	const response = await fetch(`${API_ROOT}/chats/${chatId}`, {
		method: "DELETE",
	});
	console.log("Response", response);

	if (!response.ok) {
		logError("Failed to delete chat", response.status);
		return false;
	}

	return true;
}

export async function renameChat(chatId: ChatId, name: string): Promise<boolean> {
	if (!chatId.startsWith("chat_")) {
		logError("Invalid chat ID", chatId);
		return false;
	}

	const response = await fetch(`${API_ROOT}/chats/${chatId}/rename`, {
		method: "PUT",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({name}),
	});

	if (!response.ok) {
		logError("Failed to rename chat", response.status);
		return false;
	}

	return true;
}

export async function modifyMessage(chatId: ChatId, messageId: string, newMessage: RequestMessage): Promise<boolean> {
	const response = await fetch(`${API_ROOT}/messages/set/${messageId}`, {
		method: "PUT",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({message: newMessage, chatId}),
	});

	if (!response.ok) {
		logError("Failed to modify message", response.status);
		return false;
	}

	return true;
}

export async function deleteMessage(chatId: ChatId, messageId: string, below: boolean): Promise<boolean> {
	if (messageId === "") {
		logError("Invalid message ID", messageId);
		return false;
	}
	const response = await fetch(`${API_ROOT}/messages/${messageId}?below=${below}`, {
		method: "DELETE",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({chatId}),
	});

	if (!response.ok) {
		logError("Failed to delete message", response.status);
		return false;
	}

	return true;
}

export async function loadCharacters(): Promise<TavernCharacterHead[]> {
	const full = false;
	const res = await fetch(`${API_ROOT}/characters?full=` + full.toString(), {
		method: "GET",
		headers: {"Content-Type": "application/json"},
	});

	if (!res.ok) {
		logError("Failed to load characters", res.status);
		return [];
	}

	return res.json();
}

export async function loadCharacter(characterId: string, full: boolean): Promise<TavernCharacter | null> {
	const res = await fetch(`${API_ROOT}/characters/${characterId}?full=` + full.toString(), {
		method: "GET",
		headers: {"Content-Type": "application/json"},
	});

	if (!res.ok) {
		logError("Failed to load characters", res.status);
		return null;
	}

	return res.json();
}

export function getCharacterAvatarUrl(id: TavernCharacter["id"]): string {
	return `${API_ROOT}/characters/${id}/avatar`;
}

export function getExportUrl(id: TavernCharacter["id"], type: "v2" | "png", attachment: boolean): string {
	return `${API_ROOT}/characters/${id}/${type}?attachment=${attachment}`;
}

// Turn UTC date into a Date object
function reviveMessage(message: any): Message {
	return {
		...message,
		date: new Date(message.date),
	};
}

export type OpenRouterModel = {
	id: `${string}/${string}`;
	name: string;
	pricing: {
		prompt: number;
		completion: number;
	};
};

export type OpenRouterModelId = OpenRouterModel["id"];

let lastRequestTime = 0;

export async function getOpenRouterModels(): Promise<OpenRouterModel[]> {
	// should work tbh
	const cache = lastRequestTime + 1000 * 60 > Date.now() ? "force-cache" : "default";
	console.log("Fetching models", cache, lastRequestTime, Date.now());
	// return fetch("https://openrouter.ai/api/v1/models", {cache})
	return fetch(`${API_ROOT}/openroutermodels`, {cache})
		.then((res) => res.json())
		.then((v) => {
			// Don't update on error
			lastRequestTime = Date.now();
			return v;
		});
}

export type ChatSettings = {
	temperature: number;
	topP: number;
	systemPrompt: string;
	color: "none" | "red" | "green" | "yellow" | "blue" | "orange" | "purple";
} & ChatSettingsProvider;

export type ChatSettingsProvider = {
	provider: "openrouter";
	model: OpenRouterModelId;
};

export async function getChatSettings(chatId: ChatId): Promise<ChatSettings> {
	return fetch(`${API_ROOT}/chats/${chatId}/settings`).then((res) => res.json());
}

export async function setChatSettings(chatId: ChatId, settings: Partial<ChatSettings>): Promise<boolean> {
	console.log("Setting chat settings", settings);
	return fetch(`${API_ROOT}/chats/${chatId}/settings`, {
		method: "PUT",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({settings}),
	}).then((res) => res.ok);
}

export async function autogenerateTitle(chatId: ChatId): Promise<string | null> {
	return fetch(`${API_ROOT}/chats/${chatId}/generate-title`, {
		method: "POST",
		headers: {"Content-Type": "application/json"},
	}).then(async (res) => {
		if (!res.ok) {
			const body = await res.json();
			if (res.status === 400) {
				logError("Failed to autogenerate title", body);
				return null;
			}
			if (res.status === 503) {
				logError("Service unavailable", body);
				return null;
			}
			return null;
		}
		return res.text();
	});
}

export function defaultSettings(): ChatSettings {
	return {
		provider: "openrouter",
		model: "anthropic/claude-3.5-sonnet",
		temperature: 1,
		topP: 1,
		systemPrompt: "",
		color: "none",
	};
}

export function defaultCharacter(): TavernCharacter {
	return {
		id: "",
		name: "",
		avatarUrl: "",
		data: {
			author: "",
			description: "",
			nickname: "",
			notes: "",
			version: "",
			greetings: [],
		},
	};
}

export function getAttachmentUrl(id: string, thumbnail: boolean): string {
	return `${API_ROOT}/image/${id}?thumbnail=${thumbnail}`;
}

export async function uploadAttachment(file: File): Promise<string | null> {
	const res = await fetch(`${API_ROOT}/image`, {
		method: "POST",
		body: new Blob([file], {type: file.type}),
	});

	if (!res.ok) {
		logError("Failed to upload attachment", res.status);
		return null;
	}
	return res.text();
}
