import * as markdown from "../markdown.ts";
import * as markdownNew from "../markdownNew.tsx";
import * as server from "../../server.ts";
import morphdom from "morphdom";
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
	FaSolidPlus,
	FaSolidRepeat,
	FaSolidStop,
	FaSolidTrashCan,
	FaSolidXmark,
} from "solid-icons/fa";
import {
	createComputed,
	createEffect,
	createMemo,
	createRenderEffect,
	createSignal,
	ErrorBoundary,
	For,
	Index,
	Match,
	on,
	onCleanup,
	onMount,
	Show,
	Switch,
} from "solid-js";
import Button from "../Button";
import * as utils from "../../util.ts";
import {renderToString} from "solid-js/web";
import {useIsConnected} from "../hooks/useIsConnected.ts";
import {useWidgetContext} from "../Widget.tsx";
import {useToast} from "solid-notifications";
import {Attachment} from "../hooks/useChat.ts";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import {Spinner, SpinnerType} from "solid-spinner";
import {unified} from "unified";
import h from "solid-js/h";
import remarkParse from "remark-parse";
import {Node} from "mdast";

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
	draggingDragbar: boolean;
}) {
	let chatMessagesRef: HTMLDivElement;

	const [lockScroll, setLockScroll] = createSignal(true);

	createEffect(() => {
		void props.streamingMessage;
		void props.messages;

		if (lockScroll()) {
			chatMessagesRef.scrollTo({top: chatMessagesRef.scrollHeight});
		}

		return props.messages?.length ?? null;
	});

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
		<div
			ref={(v) => ((chatMessagesRef = v), (props.ref as any)(v))}
			class="chat-messages"
			onScroll={(ev) => {
				const list = ev.currentTarget;
				setLockScroll(list.scrollTop + list.clientHeight >= list.scrollHeight - 15);
			}}
		>
			{/* Used in markdownNew.tsx */}
			<FaSolidClipboard id="_FaSolidClipboard" />
			<FaSolidArrowUp id="_FaSolidArrowUp" />
			<FaSolidArrowDown id="_FaSolidArrowDown" />
			{/*  */}
			<Show when={props.messages !== null && props.messages.length === 0}>
				<EmptyChatStub />
			</Show>
			{/* suspense won't work because in that case placeholders will flash every time we refetch messages */}
			<Show when={props.messages !== null} fallback={<PlaceholderMessages />}>
				{/* Not using For here because it makes messages flash on change. Also scrolling is messed up */}
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
									if (message.role === "assistant") {
										props.onEdit(message.id, {
											role: "assistant",
											text: newText,
										});
									} else {
										props.onEdit(message.id, {
											role: "user",
											text: newText,
											attachments: message.attachments!,
										});
									}
									onModifyMessage(i);
								}}
								onDelete={() => {
									props.onDelete(v().id);
									onModifyMessage(i);
								}}
								onDeleteBelow={() => {
									// There is a bug when this sometimes fails to work on mobile.
									// The reason is likely because the message object returned by v()
									// has an empty id and that probably happens if we refetch messages
									// right as we hold the delete button. I'll just handle this edge case
									// as a noop.
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
								draggingDragbar={props.draggingDragbar}
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
					draggingDragbar={props.draggingDragbar}
				/>
			</Show>
		</div>
	);
}

export function Input(props: {
	value: string;
	setValue: (value: string) => void;
	attachments: Attachment[];
	setAttachments: (value: Attachment[]) => void;
	onSend: () => void;
	isGenerating: boolean;
	disabled: boolean;
}) {
	let textareaRef: HTMLTextAreaElement;
	let hiddenInputRef: HTMLInputElement;

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

	const handleOnClick = () => {
		props.onSend();
		// If we have a virtual keyboard, blur the textarea (the send button in reality probably)
		// when clicking send to clear :focus-within from .supports-keyboard-inset .chat-input-wrapper:focus-within
		// and bring the input to its correct position
		if ("virtualKeyboard" in window.navigator) {
			(document.activeElement as HTMLElement)?.blur?.();
		}
	};

	const [virtualKeyboardY, setVirtualKeyboardY] = createSignal(null);
	const [shouldRaise, setShouldRaise] = createSignal(false);

	if ("virtualKeyboard" in window.navigator) {
		const listener = (ev: any) => {
			setVirtualKeyboardY(ev.target.boundingRect.y);
		};

		const nav = window.navigator.virtualKeyboard as any;
		nav.addEventListener("geometrychange", listener);
		// It's fine to call a hook here
		onCleanup(() => {
			nav.removeEventListener("geometrychange", listener);
		});
	}

	const setOverlayContent = (v: boolean) => {
		// Input moves up and down with keyboard like in chatgpt.com
		if ("virtualKeyboard" in window.navigator) {
			(window.navigator.virtualKeyboard as any).overlaysContent = v;
		}
	};

	const handleTextareaFocus = () => {
		setOverlayContent(true);
		setShouldRaise(true);
	};

	const handleTextareaBlur = () => {
		setOverlayContent(false);
		// Hack to let the user click the send button without the wrapper lowering under his finger
		// 1 instead of 0 just to be sure ig (there is a difference)
		setTimeout(() => setShouldRaise(false), 1);
	};

	const uploadAttachments = async (files: File[]) => {
		for (const file of files) {
			// TODO: try/catch
			// TODO: what if the component unmounts before the upload finishes
			const promise = server.uploadAttachment(file);

			const attachmentRef = {
				id: "",
				status: "uploading",
			} as const;

			props.setAttachments([...props.attachments, attachmentRef]);

			const id = await promise;

			if (id === null) {
				console.error("Failed to upload attachment", file);
				continue;
			}

			const newAttachments = props.attachments.map((v) => {
				if (v === attachmentRef) {
					return {
						id,
						status: "uploaded",
					} as const;
				}
				return v;
			});

			props.setAttachments(newAttachments);
		}
	};

	const handleAttachmentChange = async (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files === null || input.files.length === 0) return;

		const files = [...input.files].filter((v) => v.type.startsWith("image/"));

		await uploadAttachments(files);
	};

	const handleAttachmentDelete = (id: string) => {
		props.setAttachments(props.attachments.filter((v) => v.id !== id));
	};

	const handlePaste = async (e: ClipboardEvent) => {
		const files = Array.from(e.clipboardData?.files ?? []).filter((v) => v.type.startsWith("image/"));
		if (files.length > 0) {
			e.preventDefault();
			await uploadAttachments(files);
		}
	};

	return (
		<div
			class="chat-input-wrapper"
			classList={{
				raise: shouldRaise(),
				"at-zero": virtualKeyboardY() === 0 || virtualKeyboardY() === null,
			}}
		>
			<AttachmentList attachments={props.attachments} onDelete={handleAttachmentDelete} />
			<Button title="Attach file" class="attach" disabled={props.disabled} onClick={() => hiddenInputRef!.click()}>
				<FaSolidPlus size={"2rem"} />
				<input
					ref={hiddenInputRef!}
					type="file"
					style={{display: "none"}}
					accept="image/*"
					onChange={handleAttachmentChange}
				/>
			</Button>
			<textarea
				ref={textareaRef!}
				value={props.value}
				placeholder="Type a message"
				onInput={(e) => props.setValue(e.currentTarget.value)}
				onFocus={handleTextareaFocus}
				onBlur={handleTextareaBlur}
				onKeyDown={(e) => {
					if (props.disabled) return;
					// Pressed enter without shift key and not on mobile
					// note: no reason for reactivity here
					if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
						e.preventDefault();
						props.onSend();
					}
				}}
				onPaste={handlePaste}
			/>
			<Button
				title={props.isGenerating ? "Stop generating" : "Send or continue message"}
				class="primary"
				disabled={props.disabled}
				onClick={handleOnClick}
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
			</Button>
		</div>
	);
}

function AttachmentList(props: {attachments: Attachment[]; onDelete: (id: string) => void}) {
	return (
		<div class="attachment-list">
			<For each={props.attachments}>
				{(v) => (
					<div
						classList={{
							attachment: true,
							[v.status]: true,
						}}
						role="button"
						onClick={() => props.onDelete(v.id)}
					>
						<Switch>
							<Match when={v.status === "uploading"}>
								<Spinner type={SpinnerType.oval}></Spinner>
							</Match>
							<Match when={v.status === "uploaded"}>
								<img src={server.getAttachmentUrl(v.id, true)} alt="attachment" />
							</Match>
						</Switch>
					</div>
				)}
			</For>
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
	draggingDragbar: boolean;
}) {
	let mounted = false;

	const [isEditing, setIsEditing] = createSignal(false);
	const [isHidden, setIsHidden] = createSignal(false);
	const [editValue, setEditValue] = createSignal(props.message.text);
	// This is almost never necessary unless our optimistic updates are blocked by some other requests
	const [isDeleting, setIsDeleting] = createSignal(false);

	// Since <Messages> uses an Index, messages are reused on delete. We must reset their state on reuse.
	createComputed(() => {
		void props.message.id;

		if (!mounted) return; // Don't reset initially

		setIsEditing(false);
		setIsHidden(false);
		setEditValue(props.message.text);
		setIsDeleting(false);
	});

	// lmao i never noticed this wasn't an effect... guess this isn't really necessary
	// createSignal(() => {
	// Initialize the edit value when we start editing
	// setEditValue(props.message.text);
	// });

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

	onMount(() => (mounted = true));

	return (
		<div
			classList={{
				message: true,
				[props.message.role]: true,
				hidden: isHidden(),
				editing: isEditing(),
				deleting: isDeleting(),
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
				onDelete={() => (setIsDeleting(true), props.onDelete())}
				onDeleteBelow={() => (setIsDeleting(true), props.onDeleteBelow())}
				onRegenerate={() => props.onRegenerate()}
				isEditing={isEditing()}
				isHidden={isHidden()}
				setIsHidden={setIsHidden}
				isAnyGenerating={props.isAnyGenerating}
				isFirstAssistantMessage={props.isFirstAssistantMessage}
			/>
			<MessageContent
				role={props.message.role}
				text={props.message.text}
				chatRef={props.chatRef}
				onEditKeyDown={onEditKeyDown}
				onEditInput={(ev) => setEditValue((ev.currentTarget as HTMLTextAreaElement).value)}
				isEditing={isEditing()}
				isGeneratingThis={props.isGenerating}
				isAnyGenerating={props.isAnyGenerating}
				isImmediatelyRelevant={props.isImmediatelyRelevant}
				draggingDragbar={props.draggingDragbar}
			/>
			<MessageAttachments attachments={props.message.attachments ?? []} />
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
	role: "user" | "assistant" | "tool";
	isGeneratingThis: boolean;
	isAnyGenerating: boolean;
	isEditing: boolean;
	onEditKeyDown: (ev: KeyboardEvent) => void;
	onEditInput: (ev: InputEvent) => void;
	chatRef: HTMLDivElement | undefined;
	isImmediatelyRelevant?: boolean;
	draggingDragbar: boolean;
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
	// createRenderEffect runs DURING the render phase and this should run before it (before textarea is visible)
	createComputed(() => {
		if (props.isEditing) {
			// TODO: There is a bug: because of content-visibility, most messages will have a fixed height
			// TODO: and therefore if pressing edit brings one into the viewport and it's larger than
			// TODO: that fixed height, then `savedScrollPosition` will become invalid and stopping
			// TODO: the edit would restore scroll incorrectly. Not an easy fix.
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

	// Fade in logic
	// FIXME: this kind of works but not in code blocks for example
	//
	// const [wrappedText, setWrappedText] = createSignal("");
	// createComputed((oldText: string) => {
	// 	if (!props.isGeneratingThis) {
	// 		setWrappedText("");
	// 		return "";
	// 	}

	// 	const newText = props.text;

	// 	const wrapped = `<span class='chunk'>${utils.suffixDiff(oldText, newText)}</span>`;
	// 	setWrappedText((old) => old + wrapped);

	// 	return newText;
	// }, props.text);

	// const textForMarkdown = () => (props.isGeneratingThis ? wrappedText() : props.text);
	// const compiledMarkdown = createMemo(() => (isRelevantToUser() ? markdownNew.compileMarkdownNew(textForMarkdown()) : props.text));

	const [isRelevantToUser, setIsRelevantToUser] = createSignal(props.isImmediatelyRelevant ?? false);
	const compiledMarkdown = createMemo(() =>
		isRelevantToUser() && props.role !== "tool" ? markdownNew.compileMarkdownNew(props.text) : props.text
	);

	function updateMarkdownContent(element: HTMLElement, newHtml: string): void {
		// If the element is empty, just set the HTML directly
		if (!element.firstChild) {
			element.innerHTML = newHtml;
			return;
		}

		// Create a temporary container with the new content
		const tempContainer = element.cloneNode(false) as HTMLElement;
		tempContainer.innerHTML = newHtml;

		morphdom(element, tempContainer, {
			onBeforeElUpdated: (fromEl, toEl) => {
				// Docs say this improves perf...since 2016
				if (fromEl.isEqualNode(toEl)) {
					return false;
				}

				if (fromEl.classList.contains("code-block-container") && toEl.classList.contains("code-block-container")) {
					const toCode = toEl.querySelector("code");
					const fromCode = fromEl.querySelector("code");
					if (toCode && fromCode) {
						toCode.classList.toggle("expanded", fromCode.classList.contains("expanded"));
					}
				}

				return true;
			},
			childrenOnly: true,
		});
	}

	// Effect that updates the content of the message
	createEffect(() => {
		void props.isEditing;

		updateMarkdownContent(messageRef!, compiledMarkdown());
	});

	createEffect(() => {
		void compiledMarkdown();

		if (!isRelevantToUser() || props.isGeneratingThis || props.isEditing || props.role === "tool") {
			return;
		}

		// There's some race condition going one where the highlighted elements get replaced.
		// FIXME: This causes a flicker where the code goes highlighted -> unhighlighted -> highlighted.
		setTimeout(() => {
			for (const block of messageRef!.querySelectorAll("pre > code") as NodeListOf<HTMLElement>) {
				// addCodeBlockHeader(block, lang);

				if (block.dataset.highlighted === "yes") continue;
				if (block.innerText.length > 10000) {
					console.log("not highlighting long code block", {max: 10000, length: block.innerText.length});
					continue;
				}

				setTimeout(async () => {
					(await importHljs()).highlightElement(block as HTMLElement);

					const h5 = block.parentElement!.querySelector(".code-header > h5");
					const lang = block.className
						.split(" ")
						.find((v) => v.startsWith("language-"))
						?.slice(9) as string | null;
					if (h5 && lang) {
						h5.textContent = lang;
					}
				}, 0);
			}
		}, 0);
	});

	const handleOnClickDirect = (ev: MouseEvent) => {
		if (ev.target instanceof Element === false) return;

		// Code block copy and expand button logic
		const closestButton = ev.target.closest("button:is(.expand-button, .copy-button)");
		if (closestButton !== null) {
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
		}

		// Inline code select unscuff logic
		if (ev.target.matches(":not(pre) code")) {
			const code = ev.target as HTMLElement;
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
		}
	};

	const messageContentClassList = () => ({
		"message-content": true,
		"generating-this": props.isGeneratingThis,
	});

	const styleOnWidgetResize = () => ({
		width: `${messageRef!.offsetWidth}px`,
		height: `${messageRef!.offsetHeight}px`,
		contain: "strict",
	});

	return (
		<>
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
						<Show when={props.role !== "tool"}>
							<div
								ref={messageRef!}
								classList={messageContentClassList()}
								// innerHTML={compiledMarkdown()}
								data-relevant={isRelevantToUser() ? "yes" : "no"}
								// This prevents jank when scrolling after last message streaming finishes
								style={{
									"content-visibility": props.isImmediatelyRelevant ? "visible" : undefined,
									...(props.draggingDragbar ? styleOnWidgetResize() : {}),
								}}
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
						</Show>
						<Show when={props.role === "tool"}>
							<details>
								<summary>Tool called</summary>
								<div ref={messageRef!}>{props.text}</div>
							</details>
						</Show>
					</ErrorBoundary>
				}
			/>
		</>
	);
}

function MessageAttachments(props: {attachments: string[]}) {
	return (
		<Show when={props.attachments.length > 0}>
			<div class="message-attachments">
				<For each={props.attachments}>{(v) => <img src={server.getAttachmentUrl(v, true)} alt="attachment" />}</For>
			</div>
		</Show>
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
				role={props.role}
				onEditInput={noOp}
				onEditKeyDown={noOp}
				chatRef={null as any}
				text={"<br>".repeat(props.lines)}
				isEditing={false}
				isGeneratingThis={false}
				isAnyGenerating={false}
				isImmediatelyRelevant={true}
				draggingDragbar={false}
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
					<h3 title={`${props.chat.name} (${props.chat.id})`}>{props.chat.name}</h3>
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

async function importHljs() {
	const a = import("highlight.js/lib/core");
	const hljs = (await a).default;

	// Register very likely languages immediately
	if (hljs.listLanguages().length === 0) {
		utils.registerHljsLanguages(); // not awaiting
		await utils.registerCommonHljsLanguages();
	}
	hljs.configure({ignoreUnescapedHTML: true});

	return hljs;
}
