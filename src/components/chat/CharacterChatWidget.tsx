/* @refresh reload */

// #region imports

import {
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
import {NotifyMessage, type GenerateMessage} from "../hooks/useWs.tsx";
import {Portal} from "solid-js/web";
import {SolidMarkdown} from "solid-markdown";
import {useWs} from "../../wsContext.ts";
import Button from "../Button.tsx";
import rehypeRaw from "rehype-raw";
import {IoOptions} from "solid-icons/io";
import {createAsyncOptions, createOptions, Select} from "@thisbeyond/solid-select";
import Slider from "../Slider.tsx";
import {createStore, produce, unwrap} from "solid-js/store";
import {captureStoreUpdates, trackDeep, trackStore} from "@solid-primitives/deep";
import {getUpdatedProperties, isEmptyObject} from "../../util.ts";
import {AiOutlineRobot} from "solid-icons/ai";
import {useChat} from "../hooks/useChat.ts";
import * as server from "../../server.ts";
import {useWidgetContext} from "../Widget.tsx";
import {ChatPromptSettings} from "./ChatPromptSettings.tsx";
import {useChatTitle, useMessageScroll, useOverflowDetection} from "../hooks/chatWidgetHooks.ts";
import {
	ChatList,
	EmptyChatStub,
	Input,
	Message,
	Messages,
	PlaceholderMessage,
	PlaceholderMessages,
} from "./ChatShared.tsx";
import {CharacterChatSettings} from "./CharacterChatSettings.tsx";

// #endregion

export default function CharacterChatWidget() {
	const widgetCtx = useWidgetContext();

	let messagesRef: HTMLDivElement | undefined = undefined;

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
		chatId,
		isGenerating,
		streamingMessage,
		messages,
		chats,
		handleInsertAssistantMessage,
		renameChat,
		refetchChatHead,
	} = useChat({
		// This is retarded but I gotta handle renamind like this
		// with a roundtrip to server because my widget title system is supposed
		// to title widgets themselves not 'chats' in this specific widget.
		onRenameMessage: () => {
			const cId = chatId();
			if (cId) {
				onSelectChat(cId);
				// FIXME: chats().find() seems to be undefined when adding the first ever chat
				console.log(chats().find((v) => v.id === cId)!.name);
				// widgetCtx.setTitle(chats().find((v) => v.id === id)!.name);
			}
		},
	});

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
				<Show when={chatId() !== null}>
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
						onSend={onSendClick}
						isGenerating={isGenerating()}
						disabled={!isConnected()}
					/>
				</Show>
			</div>
			<Portal mount={widgetCtx.drawer()}>
				{/* Show is here to unmount chatdrawer every time it's hidden */}
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
					onTop={(fast) => messagesRef!.scrollTo({top: 0, behavior: fast ? undefined : "smooth"})}
					onBottom={(fast) =>
						messagesRef!.scrollTo({top: messagesRef!.scrollHeight, behavior: fast ? undefined : "smooth"})
					}
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
			<button
				title="Add assistant message"
				onclick={() => props.onInsertAssistantMessage()}
				disabled={props.chatId === null}
			>
				<AiOutlineRobot />
			</button>
			<div title="Scroll to top (double click to scroll instantly)" class="quick-action-scroll">
				<button
					onDblClick={() => props.onTop(true)}
					onClick={() => props.onTop(false)}
					disabled={props.chatId === null || !props.isMessagesOverlow}
				>
					<FaSolidAngleUp size={"1rem"} />
				</button>
				<button
					title="Scroll to bottom (double click to scroll instantly)"
					onDblClick={() => props.onBottom(true)}
					onClick={() => props.onBottom(false)}
					disabled={props.chatId === null || !props.isMessagesOverlow}
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
					<CharacterChatSettings />
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
				<OpenRouterModelSelect value={settings.model} onSelect={(v) => setSettings("model", v.id)} />
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
					value={settings.systemPrompt}
					onInput={(ev) => setSettings("systemPrompt", (ev.currentTarget as HTMLTextAreaElement).value)}
				/>
			</section>
			<section>
				<h1>Extra</h1>
				<ColorSelect value={settings.color} onSelect={(v) => setSettings("color", v)} />
			</section>
		</div>
	);
}

function ColorSelect(props: {
	value: server.ChatSettings["color"];
	onSelect: (value: server.ChatSettings["color"]) => void;
}) {
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

function OpenRouterModelSelect(props: {
	value: server.OpenRouterModelId;
	onSelect: (model: server.OpenRouterModel) => void;
}) {
	const [models] = createResource<server.OpenRouterModel[] | null>(
		async () => (await server.getOpenRouterModels()).toSorted((a, b) => a.name.localeCompare(b.name)),
		{initialValue: null}
	);

	const [initialValue, setInitialValue] = createSignal<server.OpenRouterModel | null>(null);

	createEffect(() => {
		void models.loading;

		const m = models();
		if (m !== null) {
			setInitialValue(m.find((v) => v.id === props.value) ?? null);
		}
	});

	return (
		<Select
			// this seems to be working. yeah.
			{...createOptions(models() ?? [], {
				extractText: (v: server.OpenRouterModel) => v.name,
				format: (v: server.OpenRouterModel) => v.name,
			})}
			disabled={models() === null}
			initialValue={initialValue() ?? undefined}
			// Setting initial value makes onChange fire
			onChange={(v: server.OpenRouterModel) => v.id !== props.value && props.onSelect(v)}
			placeholder={models.loading ? "Loading models..." : "Select a model"}
		/>
	);
}

function ChatInfo() {
	return <div class="chat-info"></div>;
}
