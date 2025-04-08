import {
	createSignal,
	createEffect,
	onCleanup,
	createReaction,
	Accessor,
	Resource,
	ResourceSource,
	InitializedResource,
} from "solid-js";
import {on, onMount} from "solid-js";
import * as server from "../../server";

export function useMessageScroll(options: {
	messagesRef: Accessor<HTMLDivElement | undefined>;
	messagesLoading: () => Resource<server.Message[]>["loading"];
	chatId: Accessor<server.ChatId | null>;
}) {
	const {messagesRef, messagesLoading, chatId} = options;

	const scrollToBottom = () => {
		// FUCK!
		setTimeout(() => {
			messagesRef()!.scrollTo({top: messagesRef()!.scrollHeight});
		}, 10);
	};

	// This is jank but imo 50ms of forcing scrollSnapAlign is unnoticeable
	//
	// Necessary because content-visibility: auto expands the container after we scroll
	// and the position ends up being wrong
	const scrollToBottomWhenContentRelevant = () => {
		scrollToBottom();

		// TODO: skip this if content-visibility optimisation is disabled
		const el = messagesRef()!.querySelector(".message:last-of-type")! as HTMLDivElement;
		if (!el) return; // Empty chat or something

		el.parentElement!.style.scrollSnapType = "y mandatory";
		el.style.scrollSnapAlign = "end";
		setTimeout(() => {
			el.parentElement!.style.scrollSnapType = "";
			el.style.scrollSnapAlign = "";
			scrollToBottom();
		}, 34);
	};

	// This is necessary because when chatId changes the message are still being fetched.
	const trackScrollWhenMessagesLoad = createReaction(scrollToBottomWhenContentRelevant);

	// Scroll to the bottom of the messages when the chat changes
	createEffect((oldId) => {
		const newId = chatId();
		if (newId === null || oldId === newId) return;

		// I hope messages will always be not loaded when this is called
		trackScrollWhenMessagesLoad(() => void messagesLoading());

		return newId;
	}, null);

	return {scrollToBottom};
}

export function useOverflowDetection(options: {
	chatId: Accessor<server.ChatId | null>;
	messagesRef: Accessor<HTMLElement | undefined>;
	messagesLoading: () => Resource<server.Message[]>["loading"];
}) {
	const {chatId, messagesRef, messagesLoading} = options;

	const [isMessageOverflow, setIsMessageOverflow] = createSignal(false);

	const checkOverflow = (el: HTMLElement | undefined) => {
		if (el === undefined) return false;

		return el.scrollHeight > el.clientHeight;
	};

	const messagesRefObserver = new MutationObserver(() => {
		// Don't change state if messages are still loading
		// Prevents flashes
		if (messagesLoading()) return;
		setIsMessageOverflow(checkOverflow(messagesRef()!));
	});

	// Check if the messages are overflowing when the chatId changes
	createEffect(() => {
		if (chatId() !== null) {
			messagesRefObserver.disconnect();
			messagesRefObserver.observe(messagesRef()!, {childList: true, subtree: true});
		}
	});
	onCleanup(() => messagesRefObserver.disconnect());

	return isMessageOverflow;
}

export function useChatTitle(options: {
	chatId: Accessor<server.ChatId | null>;
	title: Accessor<string>;
	renameChat: (id: server.ChatId, name: string) => Promise<void>;
	setTitle: (name: string) => void;
	chats: InitializedResource<server.ChatHead[]>;
}) {
	let mounted = false;

	const {chatId, title, renameChat, setTitle, chats} = options;

	// Chat renaming logic
	createEffect(
		on(title, async (newTitle) => {
			const cId = chatId();
			if (!mounted || cId === null) return;
			const currentChatName = () => chats().find((v) => v.id === cId)?.name;
			if (currentChatName() !== newTitle) {
				// This is to change the name back if the server didn't save it somehow
				// We wait for the rename request to succeed, then call currentChatName which uses
				// the chats() signal which will have changed after the rename request.
				// Doesn't work if the server is offline
				await renameChat(cId!, newTitle);
				const newChatName = currentChatName();
				setTitle(newChatName ?? "");
			}
		})
	);

	onMount(() => (mounted = true));
}
