import express from "express";
import http from "http";
import WebSocket, {WebSocketServer} from "ws";
import path from "path";
import {mkdir} from "node:fs/promises";
import cors from "cors";
import {validateCharacterId, validateChatId, validateImageId, validateMessageId} from "./middleware";
import {Glob} from "bun";
import {Message, type MessageId} from "./message";
import * as chat from "./chat";
import * as character from "./character";
import * as wsCompression from "./wsCompression";
import * as image from "./image";
import compression from "compression";
import type {LLMProvider, ToolChunk} from "./provider/provider";
import {OpenRouterProvider} from "./provider/openrouter";
import {DebugProvider} from "./provider/debug";
import {PassThrough} from "stream";
import type {Tool} from "./tool/tool";
import {SearchTool} from "./tool/search";

export const DATA_DIR = Bun.env.NODE_ENV === "test" ? "./test-data" : "./data";
export const CHATS_DIR = path.join(DATA_DIR, "chats");
export const CHARS_DIR = path.join(DATA_DIR, "characters");
export const CHAR_AVATAR_DIR = path.join(CHARS_DIR, "avatars");
export const IMAGES_DIR = path.join(DATA_DIR, "images");

// Ensure data directories exist
async function ensureDirectoriesExist() {
	await mkdir(DATA_DIR, {recursive: true});
	await mkdir(CHATS_DIR, {recursive: true});
	await mkdir(CHARS_DIR, {recursive: true});
	await mkdir(CHAR_AVATAR_DIR, {recursive: true});
	await mkdir(IMAGES_DIR, {recursive: true});
}

export function ensureEnv() {
	if (!Bun.env.OPENROUTER_TOKEN) {
		throw new Error(
			"Missing OPENROUTER_TOKEN environment variable. Please get a key at https://openrouter.ai/keys and set it in the environment or create a .env file."
		);
	}

	if (!Bun.env.AKASH_TOKEN) {
		console.warn(
			"Missing AKASH_TOKEN environment variable. Automatic title generation is disabled. Please get a key for free at https://chatapi.akash.network/ and set it in the environment or create a .env file."
		);
	}
}

async function getChatFilePath(chatId: string): Promise<string> {
	return path.join(CHATS_DIR, `${chatId}.json`);
}

export async function getChat(chatId: string): Promise<chat.Chat | null | "error"> {
	try {
		if (!(await existsChat(chatId))) {
			return null;
		}

		const filePath = await getChatFilePath(chatId);
		const json = await Bun.file(filePath).json();
		const a = chat.Chat.fromJSON(json);
		return a;
	} catch (error) {
		console.error("Failed to load chat", error);
		return "error";
	}
}

export async function existsChat(chatId: string): Promise<boolean | "error"> {
	try {
		const filePath = await getChatFilePath(chatId);
		return await Bun.file(filePath).exists();
	} catch (error) {
		return "error";
	}
}

export async function deleteChat(chatId: string): Promise<true | "error"> {
	try {
		const filePath = await getChatFilePath(chatId);
		await Bun.file(filePath).delete();
		return true;
	} catch (error) {
		console.error("Failed to delete chat", error);
		return "error";
	}
}

export async function clearTemporaryChats(): Promise<void> {
	try {
		console.log("Clearing temporary chats");
		const chats = await getAllChats();
		let deletedCount = 0;

		for (const chat of chats) {
			if (chat.temporary) {
				const result = await deleteChat(chat.id);
				if (result === true) {
					deletedCount++;
					notifyClients({
						type: "notify_chatDeleted",
						chatId: chat.id,
					});
				}
			}
		}

		console.log(`Cleared ${deletedCount} temporary chats`);
	} catch (error) {
		console.error("Failed to clear temporary chats:", error);
	}
}

export async function getAllChats(): Promise<chat.Chat[]> {
	const glob = new Glob("*.json");
	const chats = await Promise.all(
		(await Array.fromAsync(glob.scan(CHATS_DIR))).map((file) => Bun.file(path.join(CHATS_DIR, file)).json())
	);
	// id is `chat_{unix timestamp}` so sorting by id is sorting by creation date
	// sorting from newest to oldest
	chats.sort((a, b) => b.id.localeCompare(a.id));

	return chats.map((v) => chat.Chat.fromJSON(v));
}

export async function saveChat(chat: chat.Chat): Promise<void> {
	const filePath = await getChatFilePath(chat.id);
	await Bun.write(filePath, JSON.stringify(chat, null, 4));
}

async function getCharacter(characterId: string): Promise<character.TavernCharacter | "error" | null> {
	try {
		const filePath = path.join(CHARS_DIR, `${characterId}.json`);
		const json = await Bun.file(filePath).json();
		return character.TavernCharacter.fromJSON(json);
	} catch (error) {
		console.error("Failed to load character", error);
		return "error";
	}
}

async function getAllCharacters(): Promise<character.TavernCharacter[]> {
	const glob = new Glob("*.json");
	const characters = await Promise.all(
		(await Array.fromAsync(glob.scan(CHARS_DIR))).map((file) => Bun.file(path.join(CHARS_DIR, file)).json())
	);
	return characters.map((v) => character.TavernCharacter.fromJSON(v));
}

async function existsCharacter(characterId: string): Promise<boolean | "error"> {
	try {
		const filePath = path.join(CHARS_DIR, `${characterId}.json`);
		return await Bun.file(filePath).exists();
	} catch (error) {
		return "error";
	}
}

async function saveCharacter(character: character.TavernCharacter): Promise<void> {
	const filePath = path.join(CHARS_DIR, `${character.id}.json`);
	await Bun.write(filePath, JSON.stringify(character, null, 4));
}

async function saveCharacterAvatar(characterId: string, file: Blob): Promise<void> {
	const filePath = path.join(CHAR_AVATAR_DIR, `${characterId}.png`);
	await Bun.write(filePath, file);
}

async function deleteCharacter(characterId: string): Promise<true | "error"> {
	try {
		const filePath = path.join(CHARS_DIR, `${characterId}.json`);
		await Bun.file(filePath).delete();
		return true;
	} catch (error) {
		console.error("Failed to delete character", error);
		return "error";
	}
}

async function saveImage(id: string, data: Uint8Array): Promise<void> {
	const filePath = path.join(IMAGES_DIR, `${id}.jpg`);
	await Bun.write(filePath, data);
}

export async function getImage(id: string): Promise<Uint8Array | null> {
	const filePath = path.join(IMAGES_DIR, `${id}.jpg`);
	if (await Bun.file(filePath).exists()) {
		return await Bun.file(filePath).bytes();
	}
	return null;
}

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
	server,
	// TODO: Turn this on when bun stops being a fucking cunt
	// perMessageDeflate: true
});

// Middleware
app.use(express.json());
app.use(cors());
app.use(compression());
app.use((req, _, next) => {
	console.log(`[${req.method} ${req.originalUrl}]:`, JSON.stringify(req.body));
	next();
});

app.use(express.static("public"));
if (Bun.argv.includes("--expose-dist")) {
	console.warn("--expose-dist=true");
	app.use(express.static("../dist"));
}

// disable caching for REST. comes after express.static
app.use((_, res, next) => {
	res.header("Cache-Control", "no-store");
	next();
});

const connectedClients = new Set<WebSocket>();

type NotifyMessageData =
	| {
			type: "notify_messageInserted" | "notify_messageSet";
			messageId: string;
	  }
	| {
			type: "notify_messageDeleted";
			messageId: string;
			below: boolean;
	  }
	| {
			type: "notify_chatRenamed";
			chatId: chat.ChatId;
	  }
	| {
			type: "notify_chatCreated" | "notify_chatDeleted" | "notify_chatModified";
			chatId: chat.ChatId;
	  }
	| {
			type: "notify_charactersUpdated";
	  };

export type NotifyMessage = NotifyMessageData & {chatId?: string};

// Notify messages must start with "notify_"!
function notifyClients(message: NotifyMessage) {
	console.log("notify clients", message);
	for (const client of connectedClients) {
		client.send(JSON.stringify(message));
	}
}

wss.on("connection", (ws) => {
	wsCompression.enableCompression(ws);

	connectedClients.add(ws);

	console.log("adding to connected clients. now", connectedClients.size);

	ws.on("close", () => {
		connectedClients.delete(ws);
		console.log("removing from connected clients. now", connectedClients.size);
	});

	ws.on("message", async (message) => {
		try {
			const data = JSON.parse(message.toString());

			if (data.type === "ping") {
				ws.send(JSON.stringify({type: "pong"}));
				return;
			}

			if (data.type === "generate" || data.type === "regenerate") {
				const {chatId} = data;
				const messageId = data.type === "regenerate" ? (data.messageId as MessageId) : undefined;

				console.log(data.type, {chatId, messageId});

				const abortController = new AbortController();

				const onStop = (targetChatId: string) => {
					if (targetChatId !== chatId) return;
					abortController.abort();
					console.log("generation stopped", {chatId});
				};

				const stopMessageHandler = (message: WebSocket.RawData) => {
					const data = JSON.parse(message.toString());
					if (data.type === "stop" && "chatId" in data) {
						onStop(data.chatId);
					}
				};

				ws.on("message", stopMessageHandler);

				let assistantMessage: Message;
				let chat;
				let streamingResult;
				let existingMessageIndex = -1;

				const tools = [new SearchTool()];

				try {
					if (chatId === undefined) {
						ws.send(JSON.stringify({type: "error", message: "Chat ID is required"}));
						return;
					}

					chat = await getChat(chatId);

					if (chat === null) {
						ws.send(JSON.stringify({type: "error", message: "Chat not found", chatId}));
						return;
					}

					if (chat === "error") {
						ws.send(JSON.stringify({type: "error", message: "Failed to load chat", chatId}));
						return;
					}

					if (data.type === "regenerate") {
						if (!messageId) {
							ws.send(
								JSON.stringify({
									type: "error",
									message: "Message ID is required for regeneration",
									chatId,
								})
							);
							return;
						}

						existingMessageIndex = chat.messages.findIndex((m) => m.id === messageId);

						if (existingMessageIndex === -1) {
							ws.send(JSON.stringify({type: "error", message: "Message not found", chatId}));
							return;
						}

						if (chat.messages[existingMessageIndex].role !== "assistant") {
							ws.send(
								JSON.stringify({
									type: "error",
									message: "Only assistant messages can be regenerated",
									chatId,
								})
							);
							return;
						}

						assistantMessage = chat.messages[existingMessageIndex];
						assistantMessage.text = ""; // Clear existing text
					} else {
						// Init new message for regular generation
						assistantMessage = new Message({
							role: "assistant",
							text: "",
							model: chat.settings.model,
						});
					}

					ws.send(
						JSON.stringify({
							type: "generationStart",
							chatId,
							messageId: assistantMessage.id,
							model: chat.settings.model,
						})
					);

					// Whenever the user interacts with a normal chat, remove all the temporary ones
					if (!chat.temporary) {
						clearTemporaryChats();
					}

					// Start streaming the response

					const provider = OpenRouterProvider({tools});
					// const provider = DebugProvider({
					// 	text: await Bun.file("./debug-response.txt").text(),
					// });

					if (data.type === "generate") {
						streamingResult = await streamingResponse(ws, chat, abortController, provider);
					} else if (data.type === "regenerate") {
						streamingResult = await streamingResponse(ws, chat.slice(messageId!), abortController, provider);
					} else {
						throw "unreachable";
					}
				} finally {
					ws.off("message", stopMessageHandler);
				}

				// Save the complete response
				assistantMessage.text = streamingResult.fullResponse;

				if (streamingResult.toolCalls.length > 0) {
					assistantMessage.toolCalls = streamingResult.toolCalls;
				}

				const toolCallMessages = await Promise.all(
					streamingResult.toolCalls.map(async (call) => {
						const toolResult = await tools[call.index].call(JSON.parse(call.content));
						return Message.tool({
							callId: call.id,
							content: toolResult,
						});
					})
				);

				if (data.type === "generate") {
					// Add message for normal generation
					chat.messages.push(assistantMessage);
				}
				// For regeneration, the message is already updated in place

				chat.messages.push(...toolCallMessages);

				// Update date
				assistantMessage.updateDate("now");

				await saveChat(chat);

				notifyClients({
					type: "notify_chatModified",
					chatId,
				});

				// No need to notify about messages because that's handled by streaming response

				// Send completion notification
				ws.send(
					JSON.stringify({
						type: "generationComplete",
						message: assistantMessage,
						chatId,
					})
				);

				// if (data.type === "regenerate") {
				// 	notifyClients({type: "notify_messageSet", chatId, messageId: assistantMessage.id});
				// }

				console.log(data.type + " complete", {chatId});

				console.dir(chat);
				// Autogenerate title for chat if it's new
				if (chat.messages.length >= 2 && chat.canAutogenerateTitle) {
					chat.autogenerateTitle()
						.then(async (aiTitle) => {
							if (!aiTitle) return;

							chat.name = aiTitle;

							if (chat.messages.length >= 4) {
								// Generate the title at 2 messages and at 4 again
								chat.canAutogenerateTitle = false;
							}

							await saveChat(chat);
							notifyClients({
								type: "notify_chatRenamed",
								chatId,
							});
						})
						.catch(() => {});
				}
			}
		} catch (error) {
			console.error("WebSocket message error:", error);
			ws.send(JSON.stringify({type: "error", message: "Failed to process message"}));
		}
	});
});

app.post("/chats/:chatId/generate-title", validateChatId, async (req, res) => {
	try {
		const {chatId} = req.params;

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		if (chat.messages.length === 0) {
			res.status(400).json({error: "Chat is empty"});
			return;
		}

		if (!Bun.env.AKASH_TOKEN) {
			res.status(503).json({
				error: "No AKASH_TOKEN",
				detail: "Automatic title generation is disabled. Please set the AKASH_TOKEN environment variable.",
			});
			return;
		}

		const title = await chat.autogenerateTitle();

		if (title === null) {
			res.status(500).json({error: "Failed to generate title", detail: "No title generated"});
			return;
		}

		chat.name = title;

		await saveChat(chat);

		notifyClients({type: "notify_chatRenamed", chatId});

		res.send(title);
	} catch (error) {
		console.error("Failed to generate title", error);
		res.status(500).json({error: "Failed to generate title", detail: error?.toString()});
	}
});

// REST API Routes
app.post("/chats/new", async (req, res) => {
	try {
		const {temporary: _t} = req.query;

		if (_t !== undefined && _t !== "true" && _t !== "false") {
			res.status(400).json({error: "Invalid temporary parameter"});
			return;
		}

		const temporary = _t === "true";

		const name = temporary ? "Temporary chat" : "New chat";
		const newChat = new chat.Chat(name, [
			new Message({
				role: "assistant",
				text: `Dumbshi flaps her arms like a bird. "Hello!! You're back!"`,
				model: "manual",
			}),
		]);
		newChat.temporary = temporary;

		await saveChat(newChat);

		notifyClients({type: "notify_chatCreated", chatId: newChat.id});

		console.log("new chat", {chatId: newChat.id});

		res.json({chatId: newChat.id});
	} catch (error) {
		res.status(500).json({error: "Failed to create chat"});
	}
});

app.put("/chats/:chatId/rename", validateChatId, async (req, res) => {
	try {
		const {chatId} = req.params;
		const {name} = req.body;

		console.log("renaming chat", {chatId, name});

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		chat.name = name;
		// Prevent autogenerating title if the user sets a name
		chat.canAutogenerateTitle = false;

		notifyClients({type: "notify_chatRenamed", chatId});

		await saveChat(chat);

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to create chat"});
	}
});

// Load all chats
app.get("/chats", async (req, res) => {
	try {
		const full = req.query.full;

		if (full !== "true" && full !== "false") {
			res.status(400).json({error: "Invalid full parameter"});
			return;
		}

		const chats = await getAllChats();

		console.log("loaded", chats.length, "chats", {full});

		if (full === "false") {
			const notFullChats = chats.map((chat) => chat.head());

			res.json(notFullChats);
			return;
		}

		res.json(chats);
	} catch (error) {
		res.status(500).json({error: "Failed to fetch chats", detail: error?.toString()});
	}
});

// Load a single chat. Very similar to GET /chats/:chatId/messages
app.get("/chats/:chatId", validateChatId, async (req, res) => {
	try {
		const full = req.query.full;
		const {chatId} = req.params;

		if (full !== "true" && full !== "false") {
			res.status(400).json({error: "Invalid full parameter"});
			return;
		}

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		console.log("loaded one chat", {full});

		if (full === "false") {
			res.json(chat.head());
			return;
		}

		res.json(chat);
	} catch (error) {
		res.status(500).json({error: "Failed to fetch chats"});
	}
});

app.put("/chats/:chatId/make-permanent", validateChatId, async (req, res) => {
	try {
		const {chatId} = req.params;

		console.log("making chat permanent", {chatId});

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		chat.temporary = false;

		await saveChat(chat);

		notifyClients({type: "notify_chatRenamed", chatId});

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to make chat permanent"});
	}
});

app.delete("/chats/:chatId", validateChatId, async (req, res) => {
	try {
		const {chatId} = req.params;

		console.log("deleting chat", {chatId});

		const exists = await existsChat(chatId);

		if (exists === "error") {
			res.status(500).json({error: "Chat exists check failed"});
			return;
		}

		if (!exists) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		await deleteChat(chatId);

		notifyClients({type: "notify_chatDeleted", chatId});

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to delete chat"});
	}
});

app.get("/chats/:chatId/messages", validateChatId, async (req, res) => {
	try {
		const {chatId} = req.params;

		console.log("loading messages", {chatId});

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		// await Bun.sleep(1000);

		res.json(chat!.messages);
	} catch (error) {
		res.status(500).json({error: "Failed to fetch messages"});
	}
});

// TODO: app.post("/chats/:chatId/messages")

app.get("/chats/:chatId/settings", validateChatId, async (req, res) => {
	try {
		const {chatId} = req.params;

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		res.json(chat.settings);
	} catch (error) {
		res.status(500).json({error: "Failed to fetch settings"});
	}
});

app.put("/chats/:chatId/settings", validateChatId, async (req, res) => {
	try {
		const {chatId} = req.params;
		const {settings} = req.body;

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		console.log("updating settings", {chatId, settings});

		// idk how easy it is to corrupt the settings with this
		chat.settings = {
			...chat.settings,
			...settings,
		};

		console.log("saving chat settings", chat);
		await saveChat(chat);

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to update settings"});
	}
});

function validateMessageBody(message: unknown): message is {role: "user" | "assistant"; text: string; attachments?: string[]} {
	return (
		typeof message === "object" &&
		message !== null &&
		typeof (message as any).role === "string" &&
		((message as any).role === "user" || (message as any).role === "assistant") &&
		typeof (message as any).text === "string" &&
		((message as any).attachments === undefined ||
			(Array.isArray((message as any).attachments) &&
				(message as any).attachments.every((a: unknown) => typeof a === "string" && a.startsWith("image_"))))
	);
}

// Insert a message in chat
app.put("/messages/insert", async (req, res) => {
	try {
		const {message, chatId, position} = req.body;

		if (!validateMessageBody(message)) {
			res.status(400).json({error: "Invalid message"});
			return;
		}

		if (position !== "end" && isNaN(Number(position))) {
			res.status(400).json({error: "Invalid position"});
			return;
		}

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		let insertIndex;
		if (position === "end") {
			insertIndex = chat.messages.length;
		} else {
			insertIndex = Number(position);
		}

		insertIndex = Math.min(chat.messages.length, insertIndex);

		const newMessage = new Message({
			role: message.role,
			text: message.text,
			model: message.role === "assistant" ? "manual" : undefined,
		});
		if (message.role === "user" && message.attachments) {
			newMessage.attachments = message.attachments;
		}

		chat.messages.splice(insertIndex, 0, newMessage);
		// TODO: modify history too

		await saveChat(chat);

		notifyClients({type: "notify_messageInserted", chatId, messageId: chat.messages[insertIndex].id});

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to update message"});
	}
});

// Same as insert but override the message at the position
app.put("/messages/set", async (req, res) => {
	try {
		const {message, chatId, position} = req.body;

		if (!validateMessageBody(message)) {
			res.status(400).json({error: "Invalid message"});
			return;
		}

		if (position !== "end" && isNaN(Number(position))) {
			res.status(400).json({error: "Invalid position"});
			return;
		}

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		let insertIndex;
		if (position === "end") {
			insertIndex = chat.messages.length;
		} else {
			insertIndex = Number(position);
		}

		insertIndex = Math.min(chat.messages.length, insertIndex);

		chat.messages[insertIndex].text = message.text;
		chat.messages[insertIndex].role = message.role;
		chat.messages[insertIndex].attachments = message.attachments;

		await saveChat(chat);

		notifyClients({type: "notify_messageSet", chatId, messageId: chat.messages[insertIndex].id});

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to update message"});
	}
});

// Modify message by id
app.put("/messages/set/:id", validateMessageId, async (req, res) => {
	try {
		const {id} = req.params;
		const {message, chatId} = req.body;

		if (!validateMessageBody(message)) {
			res.status(400).json({error: "Invalid message"});
			return;
		}

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		const insertIndex = chat.messages.findIndex((m) => m.id === id);

		if (insertIndex === -1) {
			res.status(404).json({error: "Message not found"});
			return;
		}

		chat.messages[insertIndex].text = message.text;
		chat.messages[insertIndex].role = message.role;
		chat.messages[insertIndex].attachments = message.attachments;

		await saveChat(chat);

		notifyClients({type: "notify_messageSet", chatId, messageId: id});

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to update message"});
	}
});

// Delete message at
app.delete("/messages", async (req, res) => {
	try {
		const {chatId, position} = req.body;

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		if (position !== "end" && isNaN(Number(position))) {
			res.status(400).json({error: "Invalid position"});
			return;
		}

		let deleteIndex;
		if (position === "end") {
			deleteIndex = chat.messages.length - 1;
		} else {
			deleteIndex = Number(position);
		}

		const deletedId = chat.messages[deleteIndex].id;

		chat.messages.splice(deleteIndex, 1);
		// TODO: modify history too

		await saveChat(chat);

		notifyClients({type: "notify_messageDeleted", chatId, messageId: deletedId, below: false});

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to delete message"});
	}
});

// Delete message by id
app.delete("/messages/:id", validateMessageId, async (req, res) => {
	try {
		const {id} = req.params;
		// Optional
		const _below = req.query.below;
		const {chatId} = req.body;

		if (_below !== undefined && _below !== "true" && _below !== "false") {
			res.status(400).json({error: "Invalid below parameter"});
			return;
		}

		const below = _below === "true";

		const chat = await getChat(chatId);

		if (chat === null) {
			res.status(404).json({error: "Chat not found"});
			return;
		}

		if (chat === "error") {
			res.status(500).json({error: "Failed to load chat"});
			return;
		}

		const index = chat.messages.findIndex((m) => m.id === id);

		if (index === -1) {
			res.status(404).json({error: "Message not found"});
			return;
		}

		if (!below) {
			console.log("not below", index);
			chat.messages.splice(index, 1);
		} else {
			console.log("below", index, chat.messages.length - index);
			chat.messages.splice(index, chat.messages.length - index);
		}
		// TODO: modify history too

		await saveChat(chat);

		notifyClients({type: "notify_messageDeleted", chatId, messageId: id, below});

		res.status(200).send();
	} catch (error) {
		res.status(500).json({error: "Failed to delete message"});
	}
});

app.get("/characters", async (req, res) => {
	try {
		const full = req.query.full;

		if (full !== "true" && full !== "false") {
			res.status(400).json({error: "Invalid full parameter"});
			return;
		}

		const characters = await getAllCharacters();

		console.log("loaded", characters.length, "characters", {full});

		if (full === "false") {
			const notFullCharacters = characters.map((character) => character.head());

			res.json(notFullCharacters);
			return;
		}

		res.json(characters);
	} catch (error) {
		res.status(500).json({error: "Failed to fetch characters", detail: error?.toString()});
	}
});

app.get("/characters/:id", validateCharacterId, async (req, res) => {
	try {
		const full = req.query.full;
		const {id} = req.params;

		if (full !== "true" && full !== "false") {
			res.status(400).json({error: "Invalid full parameter"});
			return;
		}

		const character = await getCharacter(id);

		if (character === null) {
			res.status(404).json({error: "Character not found"});
			return;
		}

		if (character === "error") {
			res.status(500).json({error: "Failed to load character"});
			return;
		}

		console.log("loaded one character", {full});

		if (full === "false") {
			res.json(character.head());
			return;
		}

		res.json(character);
	} catch (error) {
		res.status(500).json({error: "Failed to fetch characters", detail: error?.toString()});
	}
});

app.post("/characters/new", async (req, res) => {
	try {
		const {name} = req.body;

		if (!name) {
			res.status(400).json({error: "Name is required"});
			return;
		}

		const newCharacter = new character.TavernCharacter();
		newCharacter.name = name;

		await saveCharacter(newCharacter);
		notifyClients({type: "notify_charactersUpdated"});

		console.log("new character", {characterId: newCharacter.id});

		res.json({characterId: newCharacter.id});
	} catch (error) {
		res.status(500).json({error: "Failed to create character"});
	}
});

app.patch("/characters/:id", validateCharacterId, async (req, res) => {
	try {
		const {patch} = req.body;

		if (!req.headers["content-type"]?.includes("application/json-patch+json")) {
			res.status(400).json({error: "Content type must be 'application/json-patch+json'"});
			return;
		}

		const {id} = req.params;

		const character = await getCharacter(id);

		if (character === null) {
			res.status(404).json({error: "Character not found"});
			return;
		}

		if (character === "error") {
			res.status(500).json({error: "Failed to load character"});
			return;
		}
	} catch (error) {
		res.status(500).json({error: "Failed to create character"});
	}
});

app.get("/characters/:id/avatar", validateCharacterId, async (req, res) => {
	try {
		const {id} = req.params;

		const character = await getCharacter(id);

		if (!character) {
			res.status(404).json({error: "Character not found"});
			return;
		}

		if (character === "error") {
			res.status(500).json({error: "Failed to load character"});
			return;
		}

		const file = character.avatar();

		if (!(await file.exists())) {
			res.status(404).json({error: "Avatar not found"});
			return;
		}

		res.writeHead(200, {
			"Content-Type": "image/png",
			"Content-Length": file.size,
			"Content-Disposition": `inline; filename="${character.name}.png"`,
		});

		const reader = file.stream().getReader();

		try {
			for (;;) {
				const {done, value} = await reader.read();
				if (done) break;
				res.write(value);
			}
			res.end();
		} catch (err) {
			res.status(500).end();
		}
	} catch (error) {
		res.status(500).json({error: "Failed to fetch character avatar"});
	}
});

app.get("/characters/:id/v2", validateCharacterId, async (req, res) => {
	try {
		const {id} = req.params;
		const {attachment: _attachment} = req.query;

		if (_attachment !== undefined && _attachment !== "true" && _attachment !== "false") {
			res.status(400).json({error: "Invalid attachment parameter"});
			return;
		}
		const attachment = _attachment === "true";

		const character = await getCharacter(id);

		if (!character) {
			res.status(404).json({error: "Character not found"});
			return;
		}

		if (character === "error") {
			res.status(500).json({error: "Failed to load character"});
			return;
		}

		if (attachment) {
			res.setHeader("Content-Disposition", `attachment; filename="${character.name}.json"`);
		} else {
			res.setHeader("Content-Disposition", "inline");
		}

		res.type("application/json").send(character.encodeIntoV2Json());
	} catch (error) {
		res.status(500).json({error: "Failed to fetch character"});
	}
});

app.get("/characters/:id/png", validateCharacterId, async (req, res) => {
	try {
		const {id} = req.params;
		const {attachment: _attachment} = req.query;

		if (_attachment !== undefined && _attachment !== "true" && _attachment !== "false") {
			res.status(400).json({error: "Invalid attachment parameter"});
			return;
		}
		const attachment = _attachment === "true";

		const character = await getCharacter(id);

		if (!character) {
			res.status(404).json({error: "Character not found"});
			return;
		}

		if (character === "error") {
			res.status(500).json({error: "Failed to load character"});
			return;
		}

		const avatar = character.avatar();

		if (!(await avatar.exists())) {
			res.status(404).json({error: "Avatar not found"});
			return;
		}

		const file = await avatar.arrayBuffer();

		const png = character.encodeIntoPNG(file);

		// just in case
		if (png instanceof ArrayBuffer === false) {
			res.status(500).json({error: "Failed to encode PNG"});
			return;
		}

		res.writeHead(200, {
			"Content-Type": "image/png",
			"Content-Length": png.byteLength,
			"Content-Disposition": attachment ? `attachment; filename="${character.name}.png"` : "inline",
		});

		res.end(new DataView(png));
	} catch (error) {
		res.status(500).json({error: "Failed to fetch character", detail: error?.toString()});
	}
});

app.get("/openroutermodels", async (req, res) => {
	type OpenRouterModel = {
		id: `${string}/${string}`;
		name: string;
		pricing: {
			prompt: number;
			completion: number;
		};
	};

	try {
		const response = await fetch("https://openrouter.ai/api/v1/models");

		if (!response.ok) {
			console.error("Failed to fetch models from OpenRouter", response.statusText);
			res.status(response.status).json({error: "Failed to fetch models"});
			return;
		}

		const models = await response.json();

		res.writeHead(200, {
			"Cache-Control": "private, max-age=60",
		});

		res.json(
			models.data.map(
				(v: any) =>
					({
						id: v.id,
						name: v.name,
						pricing: {
							prompt: v.pricing.prompt,
							completion: v.pricing.completion,
						},
					}) as OpenRouterModel
			)
		);
	} catch (error) {
		console.error("Error fetching models from OpenRouter:", error);
		res.status(500).json({error: "Internal server error"});
	}
});

app.get("/image/:id", validateImageId, async (req, res) => {
	try {
		const {id} = req.params;
		const {thumbnail: _thumbnail} = req.query;

		// This route allows no query param
		const thumbnail = _thumbnail === "true";

		if (typeof id !== "string") {
			res.status(400).json({error: "Invalid ID"});
			return;
		}

		let file = await getImage(id);

		if (file === null) {
			res.status(404).json({error: "Image not found"});
			return;
		}

		if (thumbnail) {
			file = await image.resizeForThumbnail(file);
		}

		res.writeHead(200, {
			"Content-Type": "image/jpeg",
			"Content-Length": file.byteLength,
			"Content-Disposition": `inline; filename="${id}.png"`,
			"Cache-Control": "public, immutable",
		});

		res.send(Buffer.from(file));
	} catch (error) {
		console.error("Failed to fetch image", error);
		res.status(500).json({error: "Failed to fetch image", detail: error?.toString()});
	}
});

app.post("/image", async (req, res) => {
	try {
		if (!req.headers["content-type"]?.startsWith("image/")) {
			res.status(400).json({error: "Content must be an image"});
			return;
		}

		const imageId = `image_${Math.random().toString(36).slice(2)}`;

		const chunks = [];
		for await (const chunk of req) {
			chunks.push(chunk);
		}
		let buffer: Uint8Array = Buffer.concat(chunks);

		try {
			buffer = await image.resizeForClaude(buffer);
		} catch (error) {
			res.status(422).json({error: "Image is not valid", detail: error?.toString()});
			return;
		}

		await saveImage(imageId, buffer);

		res.send(imageId);
	} catch (error) {
		console.error("Failed to upload image:", error);
		res.status(500).json({error: "Failed to upload image", detail: error?.toString()});
	}
});

// Should still resolve with a partial response on abort
async function streamingResponse(
	ws: WebSocket,
	chat: chat.Chat,
	abort: AbortController,
	provider: LLMProvider
): Promise<{
	fullResponse: string;
	toolCalls: ToolChunk[];
}> {
	console.log("stream generation", {chatId: chat.id});

	// openrouter.openRouterStreaming(chat.toOpenRouterConfig(), abort);
	const response = await provider.streamResponse(chat, abort);

	// todo: handle error

	console.log("streaming response", response.status);

	let fullResponse = "";

	const batch = [];
	let t1 = Date.now();

	// 60 fps
	const BATCH_TIME = 1000 / 60;

	const shorthandId = Math.random().toString(16).slice(2, 5);
	ws.send(
		JSON.stringify({
			type: "setShorthand",
			// 3 chars is enough
			id: shorthandId,
			data: {
				chatId: chat.id,
				type: "generationChunk",
			},
		})
	);

	const toolCalls = [];

	try {
		const sse = response.stream;
		// tool index -> chunk

		for await (const chunk of sse) {
			console.log("chunk", chunk);
			switch (chunk.type) {
				case "message":
					fullResponse += chunk.content;

					batch.push(chunk.content);

					// await Bun.sleep(500);

					// Send the batch if it's full or if the time has passed
					if (Date.now() - t1 > BATCH_TIME && batch.length > 0) {
						t1 = Date.now();
						ws.send(JSON.stringify({_sh: shorthandId, message: batch.join("")}));
						console.log("sent", batch.length);
						batch.length = 0;
					}

					break;
				case "tool": {
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					if (toolCalls[chunk.index] === undefined) {
						toolCalls[chunk.index] = chunk;
					}
					const toolCall = toolCalls[chunk.index];

					toolCall.content += chunk.content;

					break;
				}
				case "error":
					console.error("OpenRouter error:", chunk.content);
					ws.send(JSON.stringify({type: "generationError", message: chunk.content, chatId: chat.id}));
					return {
						fullResponse: "[error]\n\n" + JSON.stringify(chunk.content, null, 4),
						toolCalls: [],
					};
			}
		}
	} catch (ex: any) {
		if (ex.name !== "AbortError") {
			throw ex;
		}
	} finally {
		// Send any remaining messages
		if (batch.length > 0) {
			ws.send(JSON.stringify({type: "message", chatId: chat.id, message: batch.join("")}));
		}

		ws.send(
			JSON.stringify({
				type: "unsetShorthand",
				id: shorthandId,
			})
		);
	}

	return {
		fullResponse,
		// Remove potential empty slots
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		toolCalls: toolCalls.filter((v) => v !== undefined) as ToolChunk[],
	};
}

export async function main(port: number, hostname: string, listen?: () => void) {
	// Start server
	await ensureDirectoriesExist();
	ensureEnv();

	server.listen(port, hostname, () => {
		console.log(`Server running on ${hostname}:${port}`);
		listen?.();
	});

	return server;
}

if (require.main === module) {
	const portIndex = Bun.argv.indexOf("--port");
	const port = portIndex !== -1 ? Bun.argv[portIndex + 1] : undefined;
	const hostnameIndex = Bun.argv.indexOf("--host");
	const hostname = hostnameIndex !== -1 ? Bun.argv[hostnameIndex + 1] : "127.0.0.1";

	if (!hostname) {
		throw new Error("Hostname must be specified after --host");
	}

	if (port !== undefined && isNaN(+port)) {
		throw new Error("PORT must be a number");
	}

	main(port === undefined ? 3000 : +port, hostname);
}
