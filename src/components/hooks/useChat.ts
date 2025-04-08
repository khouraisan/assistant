import {createSignal, createRenderEffect, onCleanup, createResource, createReaction, createEffect, on} from "solid-js";
import {useWs} from "../../wsContext";
import * as server from "../../server";
import type {GenerateMessage, NotifyMessage} from "./useWs";

export function useChat(props: {onRenameMessage: (chatId: server.ChatId) => void}) {
	const [input, setInput] = createSignal("");
	const [chatId, setChatId] = createSignal<server.ChatId | null>(null);
	const [isGenerating, setIsGenerating] = createSignal(false);
	const [streamingMessage, setStreamingMessage] = createSignal<{id: string; content: string; model: string} | null>(
		null
	);
	const [messages, {refetch: refetchMessages, mutate: mutateMessages}] = createResource(chatId, async (id) => {
		// todo: null logic
		return (await server.loadMessages(id)) ?? [];
	});

	const [chats, {refetch: refetchChatHeads, mutate: mutateChats}] = createResource<server.ChatHeadRepr[]>(
		() => server.loadChats(),
		{
			initialValue: [],
		}
	);

	const {
		removeMessageCallback,
		removeNotifyCallback,
		abort: _abort,
		connect,
		isConnected,
		generate,
		regenerate,
		registerHandler,
		registerNotifyHandler,
		registerReconnectHandler,
	} = useWs()!;
	connect(); // Connect immediately

	// Just abort. Doesn't clean the streaming message
	const abort = async () => {
		setIsGenerating(false);
		await _abort(chatId()!);
	};

	const removeHandlers = (generate: typeof generateCallback, notify: typeof notifyCallback) => {
		removeMessageCallback(generate);
		removeNotifyCallback(notify);
	};

	// Streaming finishes. Add the message to the chat
	const updateMessages = () => {
		refetchMessages();
		refetchChatHeads(); // Refetch chats to update the last message
	};

	const handleSend = async () => {
		const id = chatId();
		if (!id) return;

		// Save the input in case of error
		const currentInput = input();
		const shouldContinue = currentInput === "";

		if (!shouldContinue) {
			mutateMessages((v) => [
				...(v ?? []),
				{id: "", chatId: id, role: "user", text: currentInput, date: new Date()},
			]);
		}

		setInput("");

		try {
			// Don't add the message if it's empty and just generate the response
			if (!shouldContinue) {
				await server.addMessage(id, {
					type: "insert",
					position: "end",
					message: {role: "user", text: currentInput},
				});
			}

			setIsGenerating(true);

			generate(id);
		} catch (e) {
			setInput(currentInput);
		}
	};

	// Stop button is clicked.
	const handleStop = async () => {
		await abort();
	};

	// Send or stop button is clicked
	const onSendClick = async () => {
		if (isGenerating()) {
			handleStop();
		} else {
			handleSend();
		}
	};

	// Set messages to undefined every time the chat changes
	// Also update the title
	createEffect((oldId) => {
		const newId = chatId();

		// Don't do anything if the chat didn't change
		if (newId === null || oldId === newId) return;

		mutateMessages(undefined);

		// Don't abort if we're not generating
		if (isGenerating()) {
			// ? Same as the note below
			// abort();
			removeHandlers(generateCallback, notifyCallback);
			setStreamingMessage(null);
		}

		return newId;
	}, null);

	// Also abort the generation when the component is unmounted
	// ? Trying to not abort since there may be multiple widgets with the same chat open
	// ? Ideally this should be explicitly checked
	onCleanup(() => {
		// abort();
		removeHandlers(generateCallback, notifyCallback);
	});

	const generateCallback = (msg: GenerateMessage) => {
		const cId = chatId();

		// Ignore messages that aren't for this chat
		if (msg.chatId !== undefined && msg.chatId !== cId) return;

		switch (msg.type) {
			case "start":
				refetchMessages();
				setIsGenerating(true);
				setStreamingMessage({
					id: msg.messageId,
					content: "",
					model: msg.model,
				});
				break;
			case "text":
				setStreamingMessage((v) => ({id: v!.id, model: v!.model, content: v!.content + msg.text}));
				break;
			case "end":
				setIsGenerating(false);

				const id = streamingMessage()!.id;
				const index = messages()!.findIndex((v) => v.id === id);

				if (index === -1) {
					// New message
					mutateMessages((v) => [
						...v!,
						{
							id: streamingMessage()!.id,
							role: "assistant",
							text: streamingMessage()!.content,
							date: new Date(),
							model: streamingMessage()!.model,
						},
					]);
				} else {
					// Regenerated message
					mutateMessages((v) => [
						...v!.slice(0, index),
						{
							id: streamingMessage()!.id,
							role: "assistant",
							text: streamingMessage()!.content,
							date: new Date(),
							model: streamingMessage()!.model,
						},
						...v!.slice(index + 1),
					]);
				}

				updateMessages();
				setStreamingMessage(null);
				break;
			case "error":
				console.error("Generate callback error", msg.error);
				setIsGenerating(false);
				updateMessages(); // Still update messages because the backend puts the error there
				break;
		}
	};

	const notifyCallbackQueue: NotifyMessage["type"][] = [];

	const notifyCallback = (msg: NotifyMessage) => {
		const id = chatId();

		// Ignore messages that aren't for this chat
		// But only when it's a message notification
		if (msg.type.startsWith("notify_message") && msg.chatId !== undefined && msg.chatId !== id) {
			console.log("Ignoring message", msg.type, "because it's not for this chat");
			return;
		}

		if (notifyCallbackQueue.at(-1) === msg.type) {
			notifyCallbackQueue.pop();
			console.log("last queue is", msg.type, "so skipping action");
			return;
		}

		switch (msg.type) {
			case "notify_messageDeleted":
				if (msg.below) {
					const msgIndex = messages()!.findIndex((v) => v.id === msg.messageId);
					if (msgIndex === -1) break;
					mutateMessages((v) => v!.slice(0, msgIndex));
				} else {
					mutateMessages((v) => v!.filter((m) => m.id !== msg.messageId));
				}
				// refetchMessages(); // Should I call this really?
				break;
			case "notify_messageInserted":
				refetchMessages();
				break;
			case "notify_messageSet":
				refetchMessages();
				break;
			case "notify_chatRenamed":
				(async () => {
					await refetchChatHeads();
					props.onRenameMessage(msg.chatId);
				})();
				break;
			case "notify_chatCreated":
			case "notify_chatDeleted":
			case "notify_chatModified":
				refetchChatHeads();
				break;
		}
	};

	const onAddChat = async (props?: {temporary: boolean}): Promise<`chat_${number}` | null> => {
		const chatEager = {
			id: "chat_-1",
			name: props?.temporary ? "Temporary chat" : "New chat",
			temporary: props?.temporary ?? false,
			color: "none",
			lastMessageSnippet: null,
			messageCount: 0,
			tokenCount: 0,
			// jank!!!!
			_fake: true,
		} satisfies server.ChatHeadRepr;

		mutateChats((v) => [chatEager, ...v]);

		const id = await server.newChat(props);
		if (!id) return null;

		const promise = refetchChatHeads();
		setChatId(id);
		await promise;
		// setting chatId twice is fine i think.
		// it's probably not causing reactions because of the same value
		selectChat(id);

		return id;
	};

	const selectChat = (id: server.ChatId) => {
		setChatId(id);
	};

	// If the chat is deleted, set the chatId to null
	// I couldn've put this in the message handler but imo an effect is more future proof
	createEffect(
		on(chats, (chats) => {
			const cId = chatId();
			if (chats.every((v) => v.id !== cId)) {
				setChatId(null);
			}
		})
	);

	const onDeleteChat = async (id: server.ChatId) => {
		if (chatId() === id) setChatId(null);
		await server.deleteChat(id);
		await refetchChatHeads();
	};

	const onMakePermanent = async (id: server.ChatId) => {
		await server.makePermanent(id);
		await refetchChatHeads();
	};

	const onEditMessage = async (id: string, newMessage: server.RequestMessage) => {
		console.log("Edit", id, newMessage);

		const msg = messages()!;
		const isLast = msg[msg.length - 1]?.id === id;

		const optimisticMessages = msg.map((v) => (v.id === id ? {...v, text: newMessage.text} : v));
		mutateMessages(optimisticMessages);

		await server.modifyMessage(chatId()!, id, newMessage);
		if (isLast) {
			await refetchChatHead(chatId()!);
		}
		await refetchMessages();
	};

	const onDeleteMessage = async (id: string) => {
		const msg = messages()!;
		const isLast = msg[msg.length - 1]?.id === id;
		const optimisticMessages = msg.filter((v) => v.id !== id);
		mutateMessages(optimisticMessages);

		notifyCallbackQueue.push("notify_messageDeleted");

		await server.deleteMessage(chatId()!, id, false);

		if (isLast) {
			await refetchChatHead(chatId()!);
		}
		await refetchMessages();
	};

	const onDeleteMessageBelow = async (id: string) => {
		const msg = messages()!;
		const idIndex = msg.findIndex((v) => v.id === id);
		const optimisticMessages = msg.slice(0, idIndex);
		mutateMessages(optimisticMessages);

		notifyCallbackQueue.push("notify_messageDeleted");

		await server.deleteMessage(chatId()!, id, true);

		// we always touch the last message so no check here
		await refetchChatHead(chatId()!);
		await refetchMessages();
	};

	const onRegenerateMessage = (messageId: string) => {
		const cId = chatId();
		if (cId === null) return;

		regenerate(cId, messageId);
	};

	const handleInsertAssistantMessage = async () => {
		const cId = chatId();
		if (!cId) return;

		// Use the text from the input
		const text = input();
		setInput("");

		mutateMessages((v) => [...(v ?? []), {role: "assistant", text, date: new Date(), id: "", model: ""}]);

		await server.addMessage(cId, {
			type: "insert",
			position: "end",
			message: {role: "assistant", text},
		});

		// the message is inserted at the end so no check
		await refetchChatHead(cId);
		await refetchMessages();
	};

	// register handlers once instead
	registerHandler(generateCallback);
	registerNotifyHandler(notifyCallback);

	createRenderEffect(() => {
		// Register the handlers every time we connect or reconnect
		// TODO: i added handler preservation logic to useWs so this isn't needed anymore i hope
		// if (isConnected()) {
		// 	removeHandlers(generateCallback, notifyCallback);
		// 	// trying a thing out
		// 	registerHandler(generateCallback);
		// 	registerNotifyHandler(notifyCallback);
		// }
	});

	// // Fetch chats if we connected after mount
	// createRenderEffect((wasConnected) => {
	// 	const nowConnected = isConnected();

	// 	if (!wasConnected && nowConnected && chats.length === 0) {
	// 		refetchChatHeads();
	// 	}

	// 	return nowConnected;
	// }, isConnected());

	registerReconnectHandler(() => {
		if (chats().length === 0) {
			refetchChatHeads();
		}
	});

	const refetchChatHead = async (chatId: server.ChatId) => {
		const refetchedHead = await server.loadChat(chatId, false);
		if (refetchedHead === null) return;
		const index = chats().findIndex((v) => v.id === refetchedHead.id);
		if (index !== -1) {
			const newChats = [...chats()];
			newChats[index] = refetchedHead;
			mutateChats(newChats);
			console.log("refetched head of", chatId);
		} else {
			// If chat exists but not in the list, refetch everything
			refetchChatHeads();
		}
	};

	const renameChat = async (id: server.ChatId, name: string) => {
		await server.renameChat(id!, name);
		await refetchChatHeads();
	};

	return {
		onDeleteMessage,
		onDeleteMessageBelow,
		onEditMessage,
		onRegenerateMessage,
		onSendClick,
		isConnected,
		onAddChat,
		selectChat,
		onDeleteChat,
		onMakePermanent,
		input,
		setInput,
		chatId,
		isGenerating,
		streamingMessage,
		messages,
		chats,
		handleInsertAssistantMessage,
		renameChat,
		refetchChatHead,
	};
}
