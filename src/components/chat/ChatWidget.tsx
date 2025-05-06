/* @refresh reload */

// #region imports
import focksGif from "../../assets/focks.gif";
import {
	createComputed,
	createEffect,
	createMemo,
	createReaction,
	createRenderEffect,
	createResource,
	createSignal,
	ErrorBoundary,
	For,
	Index,
	Match,
	on,
	onCleanup,
	onMount,
	Show,
	Suspense,
	Switch,
	untrack,
} from "solid-js";
import "../Widget.css";
import "./ChatWidget.css";
import {
	FaSolidAngleDown,
	FaSolidAngleUp,
	FaSolidArrowRight,
	FaSolidCheck,
	FaSolidCircleInfo,
	FaSolidClock,
	FaSolidEye,
	FaSolidEyeSlash,
	FaSolidGear,
	FaSolidLink,
	FaSolidListUl,
	FaSolidPaperPlane,
	FaSolidPassport,
	FaSolidPencil,
	FaSolidPlus,
	FaSolidRepeat,
	FaSolidStop,
	FaSolidTrashCan,
	FaSolidXmark,
} from "solid-icons/fa";
import {Portal} from "solid-js/web";
import Button from "../Button.tsx";
import "../hljs-theme.css";
import {IoOptions} from "solid-icons/io";
import {createAsyncOptions, createOptions, Select} from "@thisbeyond/solid-select";
import Slider from "../Slider.tsx";
import {createStore} from "solid-js/store";
import {trackStore} from "@solid-primitives/deep";
import {getUpdatedProperties, isEmptyObject} from "../../util.ts";
import {AiOutlineRobot} from "solid-icons/ai";
import {Attachment, useChat} from "../hooks/useChat.ts";
import * as server from "../../server.ts";
import {useWidgetContext} from "../Widget.tsx";
import {ChatPromptSettings} from "./ChatPromptSettings.tsx";
import {useChatTitle, useMessageScroll, useOverflowDetection} from "../hooks/chatWidgetHooks.ts";
import {ChatList, EmptyChatStub, Input, Message, Messages, PlaceholderMessages} from "./ChatShared.tsx";
import {useIsConnected} from "../hooks/useIsConnected.ts";

// #endregion

export default function ChatWidget() {
	const widgetCtx = useWidgetContext();

	let messagesRef: HTMLDivElement | undefined;

	// let mounted = false;

	const {
		onDeleteMessage,
		onDeleteMessageBelow,
		onEditMessage,
		onRegenerateMessage,
		onSendClick: _onSendClick,
		isConnected,
		onAddChat,
		selectChat,
		onDeleteChat,
		onMakePermanent,
		input,
		setInput,
		attachments,
		setAttachments,
		chatId,
		isGenerating,
		streamingMessage,
		messages,
		chats,
		handleInsertAssistantMessage,
		renameChat,
		refetchChatHead,
	} = useChat({
		// This is retarded but I gotta handle renaming like this
		// with a roundtrip to server because my widget title system is supposed
		// to title widgets themselves not 'chats' in this specific widget.
		onRenameMessage: (renamedChatId) => {
			const cId = chatId();
			// TODO: loop possible here if title has an effect that calls endpoints that rename chats?
			if (cId && renamedChatId === cId) {
				const title = chats().find((v) => v.id === cId)!.name;
				widgetCtx.setTitle(title);
				console.log("rename message", title);
			}
		},
	});

	// // Select the last chat on first load
	// {
	// 	let computed = false;
	// 	createComputed(() => {
	// 		if (computed) return;
	// 		if (chats().length > 0) {
	// 			onSelectChat(chats()[0].id);
	// 			computed = true;
	// 		}
	// 	});
	// }

	const onSelectChat = (id: server.ChatId) => {
		selectChat(id);
		widgetCtx.setTitle(chats().find((v) => v.id === id)!.name);
	};

	const handleAddChat = async () => {
		const newId = await onAddChat();
		if (newId !== null) {
			onSelectChat(newId);
		}
	};

	const handleAddTemporaryChat = async () => {
		const newId = await onAddChat({temporary: true});
		if (newId !== null) {
			onSelectChat(newId);
		}
	};

	// Send a rename request when widget title changes
	useChatTitle({
		chatId,
		title: widgetCtx.title,
		chats,
		renameChat,
		setTitle: widgetCtx.setTitle,
	});

	// Scroll to the bottom when switching chats
	const {scrollToBottom: scrollMessagesToBottom} = useMessageScroll({
		chatId,
		messagesLoading: () => messages.loading,
		messagesRef: () => messagesRef,
	});

	// Check if the chat history is scrollable
	const isMessageOverflow = useOverflowDetection({
		chatId,
		messagesLoading: () => messages.loading,
		messagesRef: () => messagesRef,
	});

	const onSendClick = () => {
		_onSendClick();
		scrollMessagesToBottom();
	};

	// TODO: this is broken. with really long messages at least
	const findObscuredMessage = async (options: {
		direction: "first" | "last";
		rootMargin: string;
		isObscured: (rect: DOMRectReadOnly, root: DOMRectReadOnly) => boolean;
	}): Promise<HTMLElement | null> => {
		if (!messagesRef) return null;

		const obs = new IntersectionObserver(() => {}, {
			root: messagesRef,
			rootMargin: options.rootMargin,
		});

		const messages = Array.from(messagesRef.querySelectorAll(".message")) as HTMLElement[];
		messages.forEach((el) => obs.observe(el));

		return new Promise((resolve) => {
			setTimeout(() => {
				const records = obs.takeRecords();
				obs.disconnect();

				const finder = options.direction === "first" ? "find" : "findLast";
				const found = messages[finder]((msgEl) => {
					const record = records.find((r) => r.target === msgEl);
					if (!record) return false;

					// Handle messages larger than viewport
					if (record.boundingClientRect.height > record.rootBounds!.height) {
						return true;
					}

					return (
						record.intersectionRatio < 1 &&
						record.isIntersecting &&
						options.isObscured(record.intersectionRect, record.rootBounds!)
					);
				});

				resolve(found ?? null);
			}, 0);
		});
	};

	const findFirstObscured = async () =>
		findObscuredMessage({
			direction: "first",
			rootMargin: "16px 0px 0px 0px",
			isObscured: (rect, root) => rect.bottom !== root.bottom,
		});

	const findLastObscured = async () =>
		findObscuredMessage({
			direction: "last",
			rootMargin: "0px 0px 16px 0px",
			isObscured: (rect, root) => rect.top !== root.top,
		});

	const handleFoundObscured = (el: HTMLElement | null, snap: "start" | "end") => {
		if (el === null) return;
		if (
			(snap === "end" && messagesRef!.scrollHeight - messagesRef!.scrollTop - messagesRef!.clientHeight === 0) ||
			(snap === "start" && messagesRef!.scrollTop === 0)
		) {
			// Don't scroll at edges
			return;
		}

		// Instantly scroll to the element - 8 pixels and then slide the rest in slowly
		// Looks less disorienting that way imo
		{
			// el.scrollIntoView({
			// 	// TODO: "start" would be ideal but there's an edge case with messages larger than
			// 	// the viewport that break scrolling down.
			// 	block: snap,
			// 	behavior: "instant",
			// });

			// messagesRef!.scrollTo({top: messagesRef!.scrollTop + (snap === "start" ? 8 : -8), behavior: "instant"});

			el.scrollIntoView({
				block: snap,
				behavior: "smooth",
			});
		}

		el.addEventListener("animationend", () => el.classList.remove("obscured-highlight"), {once: true});
		el.classList.add("obscured-highlight");
	};

	return (
		<>
			<div
				classList={{
					["chat-widget"]: true,
					generating: isGenerating(),
					loading: messages.loading && messages() === undefined,
					refreshing: messages.loading && messages() !== undefined,
				}}
			>
				<Show
					when={chatId() !== null}
					fallback={
						<GreetingScreen
							handleAddChat={handleAddChat}
							onSendClick={onSendClick}
							input={input()}
							setInput={setInput}
							attachments={attachments()}
							setAttachments={setAttachments}
							isConnected={isConnected}
						/>
					}
				>
					<Messages
						ref={messagesRef!}
						messages={messages() ?? null}
						streamingMessage={streamingMessage()}
						isGenerating={isGenerating()}
						onDelete={onDeleteMessage}
						onDeleteBelow={onDeleteMessageBelow}
						onEdit={onEditMessage}
						onRegenerate={onRegenerateMessage}
						onLastMessageChange={() => {}}
						draggingDragbar={widgetCtx.draggingDragbar()}
					/>
					<Input
						value={input()}
						setValue={setInput}
						attachments={attachments()}
						setAttachments={setAttachments}
						onSend={onSendClick}
						isGenerating={isGenerating()}
						disabled={!isConnected()}
					/>
				</Show>
			</div>
			<Portal mount={widgetCtx.drawer()}>
				{/* Show is here to unmount chatdrawer every time it's hidden because it has critical onCleanup and onMount logic */}
				<Show when={widgetCtx.showDrawer()}>
					<ChatDrawer
						chats={chats()}
						currentChatId={chatId()}
						onAddChat={handleAddChat}
						onAddTemporaryChat={handleAddTemporaryChat}
						onSelectChat={onSelectChat}
						onSelectChatDbl={() => widgetCtx.setShowDrawer(false)}
						onDeleteChat={onDeleteChat}
						onMakePermanent={onMakePermanent}
						setDrawerSize={(v) => widgetCtx.setDrawerSize(v)}
						refetchChatHead={refetchChatHead}
					/>
				</Show>
			</Portal>
			<Portal mount={widgetCtx.quickActions()}>
				<ChatQuickActions
					chatId={chatId()}
					isMessagesOverlow={isMessageOverflow()}
					maximized={widgetCtx.maximized()}
					onTop={() => {
						findFirstObscured().then((el) => handleFoundObscured(el, "start"));
						// messagesRef!.scrollTo({top: 0, behavior: fast ? undefined : "smooth"});
					}}
					onBottom={() => {
						findLastObscured().then((el) => handleFoundObscured(el, "end"));
						// messagesRef!.scrollTo({top: messagesRef!.scrollHeight, behavior: fast ? undefined : "smooth"})
					}}
					onInsertAssistantMessage={handleInsertAssistantMessage}
				/>
			</Portal>
		</>
	);
}

function ChatQuickActions(props: {
	chatId: server.ChatId | null;
	maximized: boolean;
	isMessagesOverlow: boolean;
	onTop: (fast: boolean) => void;
	onBottom: (fast: boolean) => void;
	onInsertAssistantMessage: () => void;
}) {
	return (
		<>
			<button title="Add assistant message" onclick={() => props.onInsertAssistantMessage()} disabled={props.chatId === null}>
				<AiOutlineRobot />
			</button>
			<div class="quick-action-scroll">
				<button
					title="Scroll to top (double click to scroll instantly)"
					disabled={props.chatId === null || !props.isMessagesOverlow}
					onClick={() => props.onTop(false)}
				>
					<FaSolidAngleUp size={"1rem"} />
				</button>
				<button
					title="Scroll to bottom (double click to scroll instantly)"
					disabled={props.chatId === null || !props.isMessagesOverlow}
					onClick={() => props.onBottom(false)}
				>
					<FaSolidAngleDown size={"1rem"} />
				</button>
			</div>
		</>
	);
}

type ChatDrawerTab = "list" | "settings" | "prompt" | "info";
type ChatDrawerTabSize = "small" | "large" | "max";

function ChatDrawer(props: {
	chats: server.ChatHead[];
	currentChatId: server.ChatId | null;
	onAddChat: () => void;
	onAddTemporaryChat: () => void;
	onSelectChat: (id: server.ChatId) => void;
	onSelectChatDbl: () => void;
	onDeleteChat: (id: server.ChatId) => void;
	onMakePermanent: (id: server.ChatId) => void;
	setDrawerSize: (value: ChatDrawerTabSize) => void;
	refetchChatHead: (chatId: server.ChatId) => void;
}) {
	const [state, setState] = createSignal<ChatDrawerTab>("list");

	// Update the drawer size when the state changes
	createEffect(() => {
		props.setDrawerSize(
			(
				{
					list: "small",
					info: "large",
					prompt: "large",
					settings: "large",
				} as Record<ChatDrawerTab, ChatDrawerTabSize>
			)[state()]
		);
	});

	return (
		<div
			classList={{
				"chat-drawer": true,
				["state-" + state()]: true,
			}}
		>
			<Switch>
				<Match when={state() === "list"}>
					<ChatList
						chats={props.chats}
						currentChatId={props.currentChatId}
						onAddChat={() => props.onAddChat()}
						onAddTemporaryChat={() => props.onAddTemporaryChat()}
						onSelectChat={(id) => props.onSelectChat(id)}
						onDoubleClick={() => props.onSelectChatDbl()}
						onDeleteChat={(id) => props.onDeleteChat(id)}
						onMakePermanent={(id) => props.onMakePermanent(id)}
					/>
				</Match>
				<Match when={state() === "settings"}>
					<ChatSettings
						chatId={props.currentChatId!}
						// This might be called when the component unmounts and props become bad
						refetchChatHead={() => props.refetchChatHead(props.currentChatId!)}
					/>
				</Match>
				<Match when={state() === "prompt"}>
					<ChatPromptSettings />
				</Match>
				<Match when={state() === "info"}>
					<ChatInfo />
				</Match>
			</Switch>
			<ChatDrawerOptions currentChatId={props.currentChatId} setState={setState} state={state()} />
		</div>
	);
}

function ChatDrawerOptions(props: {
	currentChatId: server.ChatId | null;
	setState: (value: ChatDrawerTab) => void;
	state: ChatDrawerTab;
}) {
	return (
		<div class="chat-drawer-options">
			<Button
				class="chat-list-option"
				color="secondary"
				onClick={() => props.setState("list")}
				disabled={props.currentChatId === null || props.state === "list"}
			>
				<FaSolidListUl size={"1.125em"} />
			</Button>
			<Button
				class="chat-settings-option"
				color="secondary"
				onClick={() => props.setState("settings")}
				disabled={props.currentChatId === null || props.state === "settings"}
			>
				{/* <FaSolidGear size={"1.125em"} /> */}
				<IoOptions size={"1.33em"} />
			</Button>
			<Button
				class="chat-prompt-option"
				color="secondary"
				onClick={() => props.setState("prompt")}
				disabled={props.currentChatId === null || props.state === "prompt"}
			>
				<FaSolidPassport size={"1.125em"} />
			</Button>
			<Button
				class="chat-info-option"
				color="secondary"
				onClick={() => props.setState("info")}
				disabled={props.currentChatId === null || props.state === "info"}
			>
				<FaSolidCircleInfo size={"1.125em"} />
			</Button>
		</div>
	);
}

function ChatSettings(props: {chatId: server.ChatId; refetchChatHead: () => void}) {
	let mounted = false;

	const [settings, setSettings] = createStore<server.ChatSettings>(server.defaultSettings());
	const [settingsLoaded, setSettingsLoaded] = createSignal(false);

	createEffect(() => {
		server
			.getChatSettings(props.chatId)
			.then(setSettings)
			.then(() => setSettingsLoaded(true));
	});

	const myUnwrap = <T,>(obj: T): T => {
		// solidjs/unwrap doesn't remove proxies for some reason!!!
		return JSON.parse(JSON.stringify(obj));
	};

	let settingsDiff = {};

	// Find which settings have changed
	createEffect((oldSettings) => {
		const newSettings = myUnwrap(trackStore(settings));

		if (mounted && untrack(settingsLoaded)) {
			const partial = getUpdatedProperties(oldSettings as server.ChatSettings, newSettings);

			// setSettingsDebounced(props.chatId, partial as any);
			settingsDiff = {...settingsDiff, ...partial};
		}

		return myUnwrap(settings);
	}, settings);

	onMount(() => (mounted = true));

	// Apply the changes on unmount
	onCleanup(async () => {
		if (isEmptyObject(settingsDiff)) return;
		await server.setChatSettings(props.chatId, settingsDiff);
		props.refetchChatHead();
	});

	const maxTemperature = () => {
		if (settings.model.startsWith("anthropic")) {
			return 1;
		}
		return 2;
	};

	// This is here to prevent the temperature from going over the max if the user changes the model to Claude
	createRenderEffect(() => {
		if (maxTemperature() !== settings.temperature) {
			setSettings("temperature", Math.min(settings.temperature, maxTemperature()));
		}
	});

	return (
		<div class="chat-settings">
			<section>
				<h1>Settings</h1>
				<OpenRouterModelSelect
					value={settings.model}
					isLoaded={settingsLoaded()}
					onSelect={(v) => setSettings("model", v.id)}
				/>
				<input
					type="text"
					placeholder="Max tokens"
					value={settings.maxTokens}
					onInput={(ev) => {
						const value = parseInt(ev.currentTarget.value, 10);

						ev.currentTarget.value = ev.currentTarget.value.replace(/[^0-9]/g, "");

						if (!isNaN(value)) {
							setSettings("maxTokens", value);
						}
					}}
				/>
				<Slider
					disabled={!settingsLoaded()}
					hideNumbers={!settingsLoaded()}
					title="Temperature"
					min={0}
					max={maxTemperature()}
					step={0.01}
					value={settings.temperature}
					onChange={(v) => setSettings("temperature", v)}
					numberInput
				/>
				<Slider
					disabled={!settingsLoaded()}
					hideNumbers={!settingsLoaded()}
					title="Max P"
					min={0}
					max={1}
					step={0.01}
					value={settings.topP}
					onChange={(v) => setSettings("topP", v)}
					numberInput
				/>
			</section>
			<section>
				<h1>System prompt</h1>
				<textarea
					class="system-prompt"
					disabled={!settingsLoaded()}
					placeholder={settingsLoaded() ? "System prompt" : "Loading..."}
					value={settings.systemPrompt}
					onInput={(ev) => setSettings("systemPrompt", (ev.currentTarget as HTMLTextAreaElement).value)}
				/>
			</section>
			<section>
				<h1>Extra</h1>
				<ColorSelect value={settings.color} onSelect={(v) => setSettings("color", v)} />
				<label>
					<input
						type="checkbox"
						checked={settings.searchTool}
						onChange={(ev) => setSettings("searchTool", ev.currentTarget.checked)}
					/>
					<span>Enable search</span>
				</label>
			</section>
		</div>
	);
}

function ColorSelect(props: {value: server.ChatSettings["color"]; onSelect: (value: server.ChatSettings["color"]) => void}) {
	const opts = createOptions(["none", "red", "green", "yellow", "blue", "orange", "purple"]);

	return (
		<Select
			{...opts}
			initialValue={props.value}
			// Setting initial value makes onChange fire
			onChange={(v) => props.onSelect(v)}
		/>
	);
}

// Due to some scuff with solid-select that doesn't respect reactive updates and lots of async shit going on here I gotta also
// give this an `isLoaded` parameter that indicates if `value` is the actual value and not a defaultSettings placeholder.
function OpenRouterModelSelect(props: {
	value: server.OpenRouterModelId;
	isLoaded: boolean;
	onSelect: (model: server.OpenRouterModel) => void;
}) {
	const [models] = createResource<server.OpenRouterModel[]>(
		async () => (await server.getOpenRouterModels()).toSorted((a, b) => a.name.localeCompare(b.name)),
		{
			initialValue: [],
		}
	);

	const [initialValue, setInitialValue] = createSignal<server.OpenRouterModel | null>(null);

	createEffect(() => {
		void models.loading;

		const m = models();
		if (m.length > 0 && props.isLoaded) {
			setInitialValue(m.find((v) => v.id === props.value) ?? null);
		}
	});

	const options = createOptions(models, {
		extractText: (v: server.OpenRouterModel) => v.name,
		format: (v: server.OpenRouterModel) => v.name,
	});

	return (
		<Show
			when={!models.loading && initialValue() !== null}
			fallback={
				// This component gets scuffed after compilation so yeah without this <Show/> OR models aren't displayed
				<Select options={[]} disabled={true} placeholder={"Loading models..."} />
			}
		>
			<Select
				// this seems to be working. yeah.
				{...options}
				disabled={models() === null}
				initialValue={initialValue()}
				// Setting initial value makes onChange fire
				onChange={(v: server.OpenRouterModel) => v.id !== props.value && props.onSelect(v)}
				placeholder={"Select a model"}
			/>
		</Show>
	);
}

function ChatInfo() {
	return <div class="chat-info"></div>;
}

function GreetingScreen(props: {
	handleAddChat: () => Promise<void>;
	onSendClick: () => void;
	input: string;
	setInput: (value: string) => void;
	attachments: Attachment[];
	setAttachments: (value: Attachment[]) => void;
	isConnected: () => boolean;
}) {
	const [creatingChat, setCreatingChat] = createSignal(false);

	const handleSend = async () => {
		// Add new chat and send
		const promise = props.handleAddChat();
		setCreatingChat(true);
		await promise;

		props.onSendClick();
	};

	return (
		<>
			<div class="chat-greeting-screen">
				<div>
					<h1>Hello!</h1>
					<p>Type your message in the input box below and hit enter or click the send button.</p>
					<img src={focksGif} />
					<Show when={creatingChat()}>
						<p>Please wait...</p>
					</Show>
				</div>
			</div>
			<Input
				value={props.input}
				setValue={(v) => props.setInput(v)}
				attachments={props.attachments}
				setAttachments={(v) => props.setAttachments(v)}
				onSend={handleSend}
				isGenerating={false} // We don't need this in the greeting screen
				disabled={!props.isConnected()}
			/>
		</>
	);
}
