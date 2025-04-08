import hljs from "highlight.js";
import * as markdown from "../markdown.ts";
import * as server from "../../server.ts";
import {
	FaSolidArrowDown,
	FaSolidArrowRight,
	FaSolidArrowsUpDown,
	FaSolidArrowUp,
	FaSolidCheck,
	FaSolidClipboard,
	FaSolidClock,
	FaSolidEye,
	FaSolidEyeSlash,
	FaSolidLink,
	FaSolidPaperPlane,
	FaSolidPencil,
	FaSolidRepeat,
	FaSolidStop,
	FaSolidTrashCan,
	FaSolidXmark,
} from "solid-icons/fa";
import {
	createEffect,
	createMemo,
	createRenderEffect,
	createSignal,
	ErrorBoundary,
	For,
	Index,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
} from "solid-js";
import Button from "../Button";
import * as utils from "../../util.ts";
import {renderToString} from "solid-js/web";
import { useIsConnected } from "../hooks/useIsConnected.ts";

export function Messages(props: {
	ref: HTMLDivElement;
	messages: server.Message[] | null;
	isGenerating: boolean;
	streamingMessage: {
		id: string;
		content: string;
		model: string;
	} | null;
	onEdit: (id: string, newMessage: server.RequestMessage) => void;
	onDelete: (id: string) => void;
	onDeleteBelow: (id: string) => void;
	onRegenerate: (id: string) => void;
	onLastMessageChange: () => void;
}) {
	let chatMessagesRef: HTMLDivElement;

	createEffect((lastMessageLen: null | number) => {
		void props.streamingMessage;
		void props.messages;

		// Scroll to the bottom when we're generating or when a new message is added
		const generating = props.isGenerating;
		// const newMessage = lastMessageLen !== (props.messages?.length ?? -1);
		const newMessage = false;
		// TODO: uuh i guess i should only scroll when we're generating here
		// TODO: and handle the initial scroll when sending in onSend somewhere
		// TODO: i could check for the messages length and last message id but i dont wanna
		if (generating || newMessage) {
			const distFromBottom =
				chatMessagesRef.scrollHeight - chatMessagesRef.clientHeight - chatMessagesRef.scrollTop;
			// console.log("scrolling because", generating ? "generating" : "new message", distFromBottom);
			// TODO: This is ran after streamingMessage is unmounted so the distance will very likely be
			// TODO: larger than 200.
			if (distFromBottom < 200) {
				chatMessagesRef!.scrollTo({top: chatMessagesRef!.scrollHeight});
			} else {
				// console.log("not scrolling because dist", distFromBottom);
			}
		}

		// TODO: skip this if content-visibility optimisation is disabled
		// fixed in css??
		// nope it's not fixed. uncommenting
		if (lastMessageLen !== null && lastMessageLen !== (props.messages?.length ?? -1) && !generating) {
			// Means the streaming has ended and a special streaming message got deleted and a
			// general message got added. This needs to be handled.
			// Even more jank. I should honestly just remove content-visibility from the messages

			const distFromBottom =
				chatMessagesRef.scrollHeight - chatMessagesRef.clientHeight - chatMessagesRef.scrollTop;
			if (distFromBottom < 200) {
				setTimeout(() => {
					chatMessagesRef!.children[chatMessagesRef!.children.length - 1].scrollIntoView({
						behavior: "instant",
						block: "start",
					});
				}, 10);
			}
		}

		return props.messages?.length ?? null;
	}, null);

	const streamingMessageObject = () =>
		props.streamingMessage !== null
			? ({
					role: "assistant",
					date: new Date(),
					text: props.streamingMessage.content,
					id: props.streamingMessage.id,
					model: props.streamingMessage.model,
				} satisfies server.Message)
			: null;

	const isStreamingMessageAlreadyInChat = createMemo(() => {
		if (props.messages === null) return false;

		const m = streamingMessageObject();
		if (m === null) return false;

		return props.messages.findIndex((v) => v.id === m.id) !== -1;
	});

	const onModifyMessage = (i: number) => {
		console.log("modify", i, props.messages);
		if (props.messages !== null && props.messages.length > 0) {
			// >= here in case we delete the last message
			if (i >= props.messages.length - 1) {
				props.onLastMessageChange();
			}
		}
	};

	return (
		<div ref={(v) => ((chatMessagesRef = v), (props.ref as any)(v))} class="chat-messages">
			<Show when={props.messages !== null && props.messages.length === 0}>
				<EmptyChatStub />
			</Show>
			{/* suspense won't work because in that case placeholders will flash every time we refetch messages */}
			<Show when={props.messages !== null} fallback={<PlaceholderMessages />}>
				<Index each={props.messages}>
					{(v, i) => {
						const messageSignal = createMemo(
							() =>
								props.streamingMessage?.id === v().id && props.streamingMessage !== null
									? streamingMessageObject()!
									: v(),
							null,
							{equals: utils.deepEquals}
						);

						return (
							<Message
								// one way ref
								chatRef={chatMessagesRef}
								isGenerating={v().id === streamingMessageObject()?.id}
								message={
									// TODO: `computations created outside a `createRoot` or `render` will never be disposed` here
									// fixed??
									messageSignal()
								}
								onEdit={(newText) => {
									const message = v();
									props.onEdit(message.id, {
										role: message.role,
										text: newText,
									});
									onModifyMessage(i);
								}}
								onDelete={() => {
									props.onDelete(v().id);
									onModifyMessage(i);
								}}
								onDeleteBelow={() => {
									props.onDeleteBelow(v().id);
									onModifyMessage(i);
								}}
								onRegenerate={() => {
									props.onRegenerate(v().id);
									onModifyMessage(i);
								}}
								isAnyGenerating={props.isGenerating}
								isFirstAssistantMessage={i === 0 && v().role === "assistant"}
								isImmediatelyRelevant={
									// this is important because I disable content-visibility on the last 3 messages
									// so the contentvisibilityautostatechange doesn't fire on them
									// and markdown doesn't get rendered
									props.messages === null ? undefined : props.messages.length - 3 <= i
								}
							/>
						);
					}}
				</Index>
			</Show>
			<Show when={props.isGenerating && streamingMessageObject() !== null && !isStreamingMessageAlreadyInChat()}>
				<Message
					chatRef={null as any}
					// should be not null when isGenerating === true
					message={streamingMessageObject()!}
					isGenerating={true}
					onEdit={() => {}}
					onDelete={() => {}}
					onDeleteBelow={() => {}}
					onRegenerate={() => {}}
					isAnyGenerating={true}
					isFirstAssistantMessage={false}
					isImmediatelyRelevant={true}
				/>
			</Show>
		</div>
	);
}

export function Input(props: {
	value: string;
	setValue: (value: string) => void;
	onSend: () => void;
	isGenerating: boolean;
	disabled: boolean;
}) {
	let textareaRef: HTMLTextAreaElement;

	createEffect(() => {
		void props.value;

		const mh = textareaRef!.style.minHeight;
		const mhPx = parseInt(getComputedStyle(textareaRef!).minHeight);

		textareaRef!.style.height = "0px";
		textareaRef!.style.minHeight = "0px";
		const ch = textareaRef!.clientHeight; // Padding at height 0
		textareaRef!.style.minHeight = mh;
		textareaRef!.style.height = `${Math.max(mhPx, textareaRef!.scrollHeight - ch)}px`;
	});

	return (
		<div class="chat-input-wrapper">
			<textarea
				ref={textareaRef!}
				value={props.value}
				placeholder="Type a message"
				onInput={(e) => props.setValue(e.currentTarget.value)}
				onKeyDown={(e) => {
					if (props.disabled) return;
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						props.onSend();
					}
				}}
			/>
			<button
				title={props.isGenerating ? "Stop generating" : "Send or continue message"}
				class="primary"
				disabled={props.disabled}
				onClick={() => props.onSend()}
			>
				<Switch
					children={
						<>
							<Match when={props.isGenerating}>
								<FaSolidStop size={"2rem"} />
							</Match>
							<Match when={props.value.length > 0}>
								<FaSolidPaperPlane size={"2rem"} />
							</Match>
						</>
					}
					fallback={<FaSolidArrowRight size={"2rem"} />}
				/>
			</button>
		</div>
	);
}

export function Message(props: {
	chatRef: HTMLDivElement;
	message: server.Message;
	isGenerating: boolean;
	isAnyGenerating: boolean;
	isFirstAssistantMessage: boolean;
	onEdit: (newText: string) => void;
	onRegenerate: () => void;
	onDelete: () => void;
	onDeleteBelow: () => void;
	isImmediatelyRelevant?: boolean;
}) {
	const [isEditing, setIsEditing] = createSignal(false);
	const [isHidden, setIsHidden] = createSignal(false);
	const [editValue, setEditValue] = createSignal(props.message.text);

	createSignal(() => {
		// Initialize the edit value when we start editing
		setEditValue(props.message.text);
	});

	const finishEditing = (newText: string) => {
		if (props.message.text !== newText) {
			props.onEdit(newText);
		}
	};

	const acceptEdit = (value: string) => {
		finishEditing(value);
		setIsEditing(false);
	};

	const discardEdit = () => {
		setIsEditing(false);
	};

	const onEditKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Enter" && e.ctrlKey) {
			e.preventDefault();
			acceptEdit((e.currentTarget as HTMLTextAreaElement).value);
		}
		if (e.key === "Escape") {
			discardEdit();
		}
	};

	return (
		<div
			classList={{
				message: true,
				[props.message.role]: true,
				hidden: isHidden(),
				editing: isEditing(),
			}}
		>
			<MessageHeader
				date={props.message.date}
				model={props.message.model}
				onEditClick={() => {
					const editing = isEditing();
					setIsEditing(!editing);
					// If we're editing and we click edit again, accept the edit
					if (editing) {
						acceptEdit(editValue());
					}
				}}
				onEditDiscard={discardEdit}
				onDelete={() => props.onDelete()}
				onDeleteBelow={() => props.onDeleteBelow()}
				onRegenerate={() => props.onRegenerate()}
				isEditing={isEditing()}
				isHidden={isHidden()}
				setIsHidden={setIsHidden}
				isAnyGenerating={props.isAnyGenerating}
				isFirstAssistantMessage={props.isFirstAssistantMessage}
			/>
			<MessageContent
				chatRef={props.chatRef}
				text={props.message.text}
				onEditKeyDown={onEditKeyDown}
				onEditInput={(ev) => setEditValue((ev.currentTarget as HTMLTextAreaElement).value)}
				isEditing={isEditing()}
				isGeneratingThis={props.isGenerating}
				isAnyGenerating={props.isAnyGenerating}
				isImmediatelyRelevant={props.isImmediatelyRelevant}
			/>
		</div>
	);
}

function MessageHeader(props: {
	date: Date;
	model?: string;
	onEditClick: () => void;
	onEditDiscard: () => void;
	onDelete: () => void;
	onDeleteBelow: () => void;
	onRegenerate: () => void;
	setIsHidden: (value: boolean) => void;
	isEditing: boolean;
	isHidden: boolean;
	isAnyGenerating: boolean;
	isFirstAssistantMessage: boolean;
}) {
	return (
		<header class="message-header">
			<time
				class="message-header-date"
				datetime={props.date.toISOString()}
				title={Intl.DateTimeFormat("en-US", {
					weekday: "long",
					year: "numeric",
					month: "long",
					day: "numeric",
					hour: "numeric",
					minute: "numeric",
				}).format(props.date)}
			>
				{props.date.toLocaleTimeString()}
			</time>
			<Show when={props.model !== undefined}>
				<span class="message-header-model">{props.model}</span>
			</Show>
			<MessageHeaderOptions
				onEditClick={() => props.onEditClick()}
				onEditDiscard={() => props.onEditDiscard()}
				onDelete={() => props.onDelete()}
				onDeleteBelow={() => props.onDeleteBelow()}
				onRegenerate={() => props.onRegenerate()}
				setIsHidden={(v) => props.setIsHidden(v)}
				isEditing={props.isEditing}
				isHidden={props.isHidden}
				isAnyGenerating={props.isAnyGenerating}
				isFirstAssistantMessage={props.isFirstAssistantMessage}
			/>
		</header>
	);
}

function MessageHeaderOptions(props: {
	onEditClick: () => void;
	onEditDiscard: () => void;
	onDelete: () => void;
	onDeleteBelow: () => void;
	onRegenerate?: () => void;
	setIsHidden: (value: boolean) => void;
	isEditing: boolean;
	isHidden: boolean;
	isAnyGenerating: boolean;
	isFirstAssistantMessage: boolean;
}) {
	return (
		<div class="message-header-options">
			<button
				title={props.isHidden ? "Unhide message" : "Visually hide message"}
				class="hide-unhide"
				onClick={() => props.setIsHidden(!props.isHidden)}
			>
				{props.isHidden ? <FaSolidEyeSlash /> : <FaSolidEye />}
			</button>
			<button
				title="Regenerate"
				class="regenerate"
				onClick={() => props.onRegenerate?.()}
				disabled={props.isHidden || props.isAnyGenerating || props.isFirstAssistantMessage}
			>
				<FaSolidRepeat />
			</button>
			<Button
				timed={1000}
				title="Delete message (hold to also delete messages below)"
				class="delete"
				onTimedCancel={() => props.onDelete()}
				onClick={() => props.onDeleteBelow()}
				disabled={props.isAnyGenerating}
			>
				<FaSolidTrashCan />
			</Button>

			<button
				title={props.isEditing ? "Accept edit" : "Edit message"}
				class="edit"
				onClick={() => props.onEditClick()}
				disabled={props.isHidden}
			>
				{props.isEditing ? <FaSolidCheck /> : <FaSolidPencil />}
			</button>
			<button title="Discard edit" class="discard-edit" onClick={() => props.onEditDiscard()}>
				<FaSolidXmark />
			</button>
		</div>
	);
}

function MessageContent(props: {
	text: string;
	isGeneratingThis: boolean;
	isAnyGenerating: boolean;
	isEditing: boolean;
	onEditKeyDown: (ev: KeyboardEvent) => void;
	onEditInput: (ev: InputEvent) => void;
	chatRef: HTMLDivElement | undefined;
	isImmediatelyRelevant?: boolean;
}) {
	let textareaRef: HTMLTextAreaElement;
	let messageRef: HTMLDivElement;

	let savedScrollPosition: number | null = null;
	const scaleTextarea = (preserveChatScroll: "saved" | "current" | false) => {
		let scrollPosition = null;
		if (preserveChatScroll === "saved") {
			scrollPosition = savedScrollPosition ?? props.chatRef!.scrollTop;
		} else if (preserveChatScroll === "current") {
			scrollPosition = props.chatRef!.scrollTop;
		}

		const computed = getComputedStyle(textareaRef!);
		// 1px gets parsed as 1
		const borderHeight = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
		textareaRef!.style.height = "0px";
		const minHeight = textareaRef!.style.minHeight;
		textareaRef!.style.height = `${textareaRef!.scrollHeight + borderHeight}px`;
		textareaRef!.style.minHeight = minHeight;

		// Jank otherwise
		if (preserveChatScroll !== false) {
			requestAnimationFrame(() => (props.chatRef!.scrollTop = scrollPosition!));
		}
	};

	// A hack to get the scroll position before contents get replaced with a textarea
	createRenderEffect(() => {
		if (props.isEditing) {
			savedScrollPosition = props.chatRef!.scrollTop;
		} else {
			savedScrollPosition = null;
		}
	});

	createEffect(() => {
		if (props.isEditing) {
			textareaRef!.focus();
			scaleTextarea("saved");
		}
	});

	const [isRelevantToUser, setIsRelevantToUser] = createSignal(props.isImmediatelyRelevant ?? false);
	const compiledMarkdown = createMemo(() => (isRelevantToUser() ? markdown.compileMarkdown(props.text) : props.text));

	createEffect(() => {
		void compiledMarkdown();

		if (!isRelevantToUser() || props.isGeneratingThis || props.isEditing) {
			return;
		}

		function addCodeBlockHeader(code: HTMLElement, lang: string) {
			const pre = code.parentElement as HTMLPreElement;

			const testNode = document.createElement("div");
			testNode.className = "code-header";
			testNode.innerHTML = `\
<h5>${lang}</h5>
<div>
 <button class="copy-button" title="Copy code">${document.querySelector("._svg-FaSolidClipboard")!.innerHTML}</button>
 <button class="expand-button">
  <div title="Collapse code block">${document.querySelector("._svg-FaSolidArrowUp")!.innerHTML}</div>
  <div title="Expand code block">${document.querySelector("._svg-FaSolidArrowDown")!.innerHTML}</div>
 </button>
</div>
`;
			pre.insertBefore(testNode, code);
		}

		// There's some race condition going one where the highlighted elements get replaced.
		// FIXME: This causes a flicker where the code goes highlighted -> unhighlighted -> highlighted.
		setTimeout(() => {
			for (const block of messageRef!.querySelectorAll("pre > code") as NodeListOf<HTMLElement>) {
				if (!block.parentElement!.querySelector(".code-header")) {
					const lang =
						block.className
							.split(" ")
							.find((v) => v.startsWith("language-"))
							?.slice(9) ?? "text";
					addCodeBlockHeader(block, lang);
				}

				if (block.dataset.highlighted === "yes") continue;

				setTimeout(() => hljs.highlightElement(block as HTMLElement), 0);
			}

			// This unselects the trailing whitespace after an inline code element in most situations
			for (const code of messageRef!.querySelectorAll(":not(pre) code")) {
				(code as HTMLElement).addEventListener("click", (ev: MouseEvent) => {
					const selection = window.getSelection();

					if (
						ev.detail !== 2 ||
						!selection?.rangeCount ||
						code.nextSibling === null ||
						code.nextSibling.textContent === null ||
						code.childNodes.length === 0 ||
						Array.from(code.childNodes).some((v) => v.nodeName !== "#text")
					)
						return;

					const range = selection.getRangeAt(0);

					if (range.endOffset === 1 && code.nextSibling.textContent.startsWith(" ")) {
						range.setEnd(code.firstChild!, (code.firstChild! as Text).length!);
					}
				});
			}
		}, 0);
	});

	const handleOnClickDirect = (ev: MouseEvent) => {
		if (ev.target instanceof Element === false) return;

		const closestButton = ev.target.closest("button:is(.expand-button, .copy-button)");
		if (closestButton === null) return;

		const code = ev.target.closest("pre")?.querySelector("code");
		if (!code) return;

		if (closestButton.classList.contains("copy-button")) {
			const textToCopy = code.innerText;
			if (textToCopy) {
				navigator.clipboard.writeText(textToCopy);
			}
		}

		if (closestButton.classList.contains("expand-button")) {
			code.classList.toggle("expanded");
		}
	};

	const messageContentClassList = () => ({
		"message-content": true,
		"generating-this": props.isGeneratingThis,
	});

	return (
		<>
			{/* gigahack */}
			<div class="_svg-FaSolidArrowUp" inert style={{display: "none"}}>
				<FaSolidArrowUp />
			</div>
			<div class="_svg-FaSolidArrowDown" inert style={{display: "none"}}>
				<FaSolidArrowDown />
			</div>
			<div class="_svg-FaSolidClipboard" inert style={{display: "none"}}>
				<FaSolidClipboard />
			</div>
			<Show
				when={props.isEditing}
				children={
					<textarea
						ref={textareaRef!}
						class="message-content-edit"
						value={props.text}
						onKeyDown={(ev) => props.onEditKeyDown(ev)}
						onInput={(ev) => (scaleTextarea("current"), props.onEditInput(ev))}
					/>
				}
				fallback={
					<ErrorBoundary
						fallback={
							<div ref={messageRef!} classList={messageContentClassList()}>
								{props.text}
							</div>
						}
					>
						<div
							ref={messageRef!}
							classList={messageContentClassList()}
							innerHTML={compiledMarkdown()}
							data-relevant={isRelevantToUser() ? "yes" : "no"}
							// This prevents jank when scrolling after last message streaming finishes
							style={{"content-visibility": props.isImmediatelyRelevant ? "visible" : undefined}}
							// TODO: skip this if content-visibility optimisation is disabled
							// @ts-expect-error // too lazy to declare this event
							on:contentvisibilityautostatechange={(ev: ContentVisibilityAutoStateChangeEvent) => {
								// console.log("contentvisibilityautostatechange", [props.text.slice(0, 20)]);
								if (!ev.skipped) {
									setIsRelevantToUser(true);
								}
							}}
							on:click={handleOnClickDirect}
						/>
					</ErrorBoundary>
				}
			/>
		</>
	);
}

export function PlaceholderMessage(props: {role: "user" | "assistant"; lines: number}) {
	const noOp = () => {};

	return (
		<div
			classList={{
				placeholder: true,
				message: true,
				[props.role]: true,
			}}
		>
			<MessageHeader
				onEditDiscard={noOp}
				date={new Date()}
				onEditClick={noOp}
				onDelete={noOp}
				onDeleteBelow={noOp}
				isEditing={false}
				isHidden={false}
				setIsHidden={noOp}
				onRegenerate={noOp}
				isAnyGenerating={false}
				isFirstAssistantMessage={false}
			/>
			<MessageContent
				onEditInput={noOp}
				onEditKeyDown={noOp}
				chatRef={null as any}
				text={"<br>".repeat(props.lines)}
				isEditing={false}
				isGeneratingThis={false}
				isAnyGenerating={false}
				isImmediatelyRelevant={true}
			/>
		</div>
	);
}

export function PlaceholderMessages() {
	return (
		<>
			<PlaceholderMessage role="user" lines={1} />
			<PlaceholderMessage role="assistant" lines={10} />
			<PlaceholderMessage role="user" lines={2} />
			<PlaceholderMessage role="assistant" lines={15} />
		</>
	);
}

export function EmptyChatStub() {
	return <div class="empty-chat-stub">Start a conversation</div>;
}

export function ChatList(props: {
	chats: server.ChatHead[];
	currentChatId: server.ChatId | null;
	onAddChat: () => void;
	onAddTemporaryChat: () => void;
	onSelectChat: (id: server.ChatId) => void;
	onDoubleClick: () => void;
	onDeleteChat: (id: server.ChatId) => void;
	onMakePermanent: (id: server.ChatId) => void;
}) {
	const isConnected = useIsConnected();

	return (
		<ul class="chat-list">
			<div class="chat-list-buttons">
				<button
					data-tip="add-chat"
					title="Create new chat"
					class="new-chat secondary"
					onClick={() => props.onAddChat()}
					disabled={!isConnected()}
				>
					<h3>Add</h3>
				</button>
				<button
					data-tip="add-temporary-chat"
					title="Create new temporary chat"
					class="new-temporary-chat secondary"
					onClick={() => props.onAddTemporaryChat()}
					disabled={!isConnected()}
				>
					<h3>
						<FaSolidClock />
					</h3>
				</button>
			</div>
			<hr />
			<For each={props.chats}>
				{(head) => (
					<ChatListItem
						isCurrent={head.id === props.currentChatId}
						chat={head}
						onClick={() => props.onSelectChat(head.id)}
						onDoubleClick={() => props.onDoubleClick()}
						onDelete={() => props.onDeleteChat(head.id)}
						onMakePermanent={() => props.onMakePermanent(head.id)}
						disabled={!isConnected()}
					/>
				)}
			</For>
		</ul>
	);
}

function ChatListItem(props: {
	chat: server.ChatHeadRepr;
	isCurrent: boolean;
	onClick: () => void;
	onDoubleClick: () => void;
	onDelete: () => void;
	onMakePermanent: () => void;
	disabled?: boolean;
}) {
	let liRef: HTMLLIElement;

	return (
		<li
			ref={liRef!}
			classList={{
				["chat-list-item"]: true,
				current: props.isCurrent,
				temporary: props.chat.temporary,
				fake: props.chat._fake === true,
				disabled: props.disabled,
			}}
		>
			<button
				class="secondary"
				onClick={(ev) => {
					// Skip double clicks in this handler
					if (ev.detail === 1) props.onClick();
				}}
				onDblClick={() => props.onDoubleClick()}
			>
				<header class={"mark-" + props.chat.color}>
					<h3 title={props.chat.id}>{props.chat.name}</h3>
					<h5 title={`Approximately ${props.chat.tokenCount} tokens`}>{props.chat.tokenCount}</h5>
					<h5 title={props.chat.messageCount + " messages"}>{props.chat.messageCount}</h5>
				</header>
				<div class="message-snippet">{props.chat.lastMessageSnippet}</div>
				<footer>
					<Show when={props.chat.temporary}>
						<>
							<div class="temporary-icon" title="This chat is temporary">
								<FaSolidClock />
							</div>
							<Button
								title="Make permanent"
								stopPropagation
								color="primary"
								class="permanent-button"
								onClick={() => props.onMakePermanent()}
							>
								<FaSolidLink size={"1.1rem"} />
							</Button>
						</>
					</Show>
					<Button
						title="Delete chat (hold)"
						stopPropagation
						timed={500}
						color="primary"
						class="delete-button"
						onClick={() => {
							liRef!.classList.add("deleting");
							props.onDelete();
						}}
					>
						<FaSolidTrashCan size={"1.1rem"} />
					</Button>
				</footer>
			</button>
		</li>
	);
}
