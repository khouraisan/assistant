import {
	Accessor,
	createContext,
	createEffect,
	createSignal,
	lazy,
	Match,
	onCleanup,
	onMount,
	Show,
	Suspense,
	Switch,
	useContext,
} from "solid-js";
import "./Widget.css";
import {TbResize} from "solid-icons/tb";
import {FaSolidArrowsLeftRight, FaSolidPlus, FaSolidXmark} from "solid-icons/fa";
import {FiMaximize2, FiMinimize2} from "solid-icons/fi";
import Button from "./Button";
import {BsThreeDotsVertical} from "solid-icons/bs";
import {getCaretOffset, isSelectingSelf} from "../util";
import { SsWidget } from "./ss/SsWidget";

export type WidgetProps = {
	isLastWidget: boolean;
	isNoScrollActive: boolean;
	isAlignCenterActive: boolean;
	index: number;
	type: "chat" | "character-chat" | "sort" | "character-manager" | "empty" | "ss";
	onClose?: () => void;
};

export type WidgetContext = {
	index: Accessor<number>;
	drawer: Accessor<HTMLDivElement>;
	quickActions: Accessor<HTMLDivElement>;
	maximized: Accessor<boolean>;
	title: Accessor<string>;
	setTitle: (value: string) => void;

	setShowDrawer: (value: boolean) => void;
	showDrawer: Accessor<boolean>;
	setDrawerSize: (value: "small" | "large" | "max") => void;
	resizing: Accessor<boolean>;
	draggingDragbar: Accessor<boolean>;
};

const WidgetContext = createContext<WidgetContext>();

export function useWidgetContext(): WidgetContext {
	const v = useContext(WidgetContext);
	// this throws on HMR.
	// if (!v) throw new Error("No WidgetContext present");
	return v!;
}

// Define lazy components
const ChatWidget = lazy(() => import("./chat/ChatWidget"));
const CharacterChatWidget = lazy(() => import("./chat/CharacterChatWidget"));
const CharacterManagerWidget = lazy(async () => ({
	default: (await import("./character/CharacterManagerWidget")).CharacterManagerWidget,
}));
const SortWidget = lazy(async () => ({
	default: (await import("./chat/SortWidget")).SortWidget,
}));

export default function Widget(props: WidgetProps) {
	let widgetRef: HTMLDivElement;
	let drawerRef: HTMLDivElement;
	let quickActionsRef: HTMLDivElement;

	const isMobileProbably = () => document.body.clientWidth <= 480 && window.matchMedia("(pointer: coarse)").matches;

	const [title, setTitle] = createSignal<string>(typeToDefautTitle(props.type));
	const [resizing, setResizing] = createSignal(false);
	const [maximized, setMaximized] = createSignal(isMobileProbably());
	const [_width, setWidth] = createSignal(0);
	const cssWidth = () => (maximized() ? undefined : _width() + "px");
	const [showDrawer, setShowDrawer] = createSignal(false);
	const [drawerSize, setDrawerSize] = createSignal<"small" | "large" | "max">("small");
	// Set to true if the widget accesses drawerRef
	const [isUsingDrawer, setIsUsingDrawer] = createSignal(false);
	const [isDraggingDragbar, setIsDraggingDragbar] = createSignal(false);

	const initResize = () => {
		setIsDraggingDragbar(true);
		document.body.style.cursor = "ew-resize";

		const {left, width: w} = widgetRef!.getBoundingClientRect();
		const center = left + w / 2;
		const handleMouseMove = (ev: MouseEvent) => {
			if (props.isAlignCenterActive) {
				setWidth((ev.clientX - center) * 2);
			} else {
				setWidth(ev.clientX - left);
			}
		};
		const handleMouseUp = () => {
			setIsDraggingDragbar(false);
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
		};
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	};

	function getRemainingWidth(parentElement: HTMLElement) {
		const computed = getComputedStyle(parentElement);
		const parentWidth = parentElement.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight);

		const gap = parseFloat(computed.gap);
		// :3
		const widths = eval(
			Array.from(parentElement.children)
				.map((el) => (el as HTMLElement).offsetWidth)
				.join("+")
		);

		return parentWidth - widths - gap * (parentElement.children.length - 1);
	}

	onMount(() => {
		if (!isMobileProbably()) {
			setWidth(
				Math.min(
					(document.body.clientWidth * 5) / 7,
					Math.max(document.body.clientWidth / 4, getRemainingWidth(widgetRef!.parentElement!))
				)
			);
		} else {
			const main = document.querySelector("main")!;
			// idk what -1 is for
			setWidth(
				-1 +
					main.clientWidth -
					(parseFloat(getComputedStyle(main).paddingLeft) + parseFloat(getComputedStyle(main).paddingRight))
			);
		}
		console.log("widget mounted", drawerRef!);
	});

	const fillRemainingSpace = () => {
		const remainingWidth = getRemainingWidth(widgetRef!.parentElement!);
		console.log(remainingWidth);
		// -1 is probably for the border
		const newWidth = _width() + remainingWidth - 1;
		const computed = getComputedStyle(widgetRef!.parentElement!);
		const horizontalPadding = parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight);
		const maxWidth = document.body.clientWidth - horizontalPadding;
		setWidth(Math.min(maxWidth, newWidth));
	};

	//* Just... don't
	// const allSpaceFilledWhenNoScrolling = () => {};

	const shouldDisableFillSpace = () => maximized() || resizing(); // || allSpaceFilledWhenNoScrolling()

	// Used in drawer for example
	const [observedWidth, setObservedWidth] = createSignal("0px");
	const observer = new ResizeObserver(() => {
		setObservedWidth(getComputedStyle(widgetRef!).width);
	});

	onMount(() => {
		observer.observe(widgetRef!);
	});

	onCleanup(() => observer.disconnect());

	const widgetContextValue: WidgetContext = {
		drawer: () => {
			setIsUsingDrawer(true);
			return drawerRef!;
		},
		quickActions: () => quickActionsRef!,
		index: () => props.index,
		setDrawerSize,
		maximized,
		title,
		setTitle,
		setShowDrawer,
		showDrawer,
		resizing,
		draggingDragbar: isDraggingDragbar,
	};

	return (
		<div
			ref={widgetRef!}
			classList={{
				widget: true,
				[props.type]: true,
				resizing: resizing(),
				"dragging-dragbar": isDraggingDragbar(),
				maximized: maximized(),
			}}
			style={{width: cssWidth(), "--widgetWidth": observedWidth()}}
		>
			<header>
				<button
					style={{display: isUsingDrawer() ? undefined : "none"}}
					title="Open drawer"
					onClick={() => setShowDrawer(true)}
					class="drawer-open-button"
				>
					<BsThreeDotsVertical />
				</button>
				<WidgetTitle title={title()} onTitleChange={setTitle} />
				<WidgetQuickActions ref={quickActionsRef!} />
				<button
					title={maximized() ? "Minimize widget" : "Maximize widget"}
					class="maximize-minimize-button secondary"
					onClick={() => (setResizing(false), setMaximized(!maximized()))}
				>
					<Show when={maximized()} children={<FiMinimize2 />} fallback={<FiMaximize2 />} />
				</button>
				<button
					title="Fill remaining space"
					class="fill-space-button secondary"
					onClick={fillRemainingSpace}
					disabled={shouldDisableFillSpace()}
				>
					<FaSolidArrowsLeftRight />
				</button>
				<button
					title={resizing() ? "Stop resizing widget" : "Resize widget"}
					class="resize-button"
					disabled={maximized()}
					onClick={() => setResizing(!resizing())}
				>
					<TbResize />
				</button>
				<Show when={props.onClose}>
					<Button
						title="Close widget (hold)"
						timed={500}
						color="secondary"
						class="close-button"
						onClick={() => props.onClose?.()}
					>
						<FaSolidXmark />
					</Button>
				</Show>
			</header>
			<WidgetDrawer show={showDrawer()} onHide={() => setShowDrawer(false)} ref={drawerRef!} drawerSize={drawerSize()} />
			<div class="widget-content">
				<WidgetContext.Provider value={widgetContextValue}>
					<Switch>
						<Match when={props.type === "chat"}>
							<ChatWidget />
						</Match>
						<Match when={props.type === "character-chat"}>
							<CharacterChatWidget />
						</Match>
						<Match when={props.type === "sort"}>
							<SortWidget />
						</Match>
						<Match when={props.type === "character-manager"}>
							<CharacterManagerWidget />
						</Match>
						<Match when={props.type === "empty"}>
							<EmptyWidget />
						</Match>
						<Match when={props.type === "ss"}>
							<SsWidget />
						</Match>
					</Switch>
				</WidgetContext.Provider>
			</div>
			<div class="dragbar" onMouseDown={initResize} style={{display: resizing() ? undefined : "none"}}></div>
		</div>
	);
}

function EmptyWidget() {
	return (
		<>
			<div>Add</div>
			<div>
				<FaSolidPlus />
			</div>
		</>
	);
}

function WidgetQuickActions(props: {ref: HTMLDivElement}) {
	return (
		<div class="widget-quick-actions" ref={props.ref}>
			{/* portal */}
		</div>
	);
}

function WidgetDrawer(props: {show: boolean; onHide: () => void; ref: HTMLDivElement; drawerSize: "small" | "large" | "max"}) {
	let widgetDrawerRef: HTMLDivElement;

	const [hasAnimatedOnce, setHasAnimatedOnce] = createSignal(false);

	// Tell CSS that we've already animated the drawer appearing.
	// Prevents animations from running when changing size classes
	createEffect(() => {
		if (!props.show) {
			setHasAnimatedOnce(false);
			return;
		}
		if (hasAnimatedOnce()) return;

		// Gotta change this if I add more animations in the future
		const onFinish = () => setHasAnimatedOnce(true);
		for (const v of widgetDrawerRef!.getAnimations()) {
			v.onfinish = onFinish;
		}
	});

	return (
		<aside
			classList={{
				"widget-drawer-wrapper": true,
				show: props.show,
			}}
			onClick={(ev) => ev.target === ev.currentTarget && props.onHide()}
		>
			<div
				ref={widgetDrawerRef!}
				class="widget-drawer"
				classList={{
					[props.drawerSize]: true,
					["has-animated-once"]: hasAnimatedOnce(),
				}}
			>
				<header>
					<button onClick={() => props.onHide()} class="drawer-close-button">
						<BsThreeDotsVertical />
					</button>
				</header>
				<div class="widget-drawer-content" ref={props.ref}>
					{/* portal */}
				</div>
			</div>
		</aside>
	);
}

function WidgetTitle(props: {title: string; onTitleChange: (newTitle: string) => void}) {
	let inputRef: HTMLInputElement;
	let h2Ref: HTMLHeadingElement;

	const [editing, setEditing] = createSignal(false);

	const startEdit = (caretOffset?: number) => {
		setEditing(true);
		inputRef!.focus();
		if (caretOffset !== undefined) inputRef!.setSelectionRange(caretOffset, caretOffset);
	};
	const stopEdit = () => (setEditing(false), props.onTitleChange(inputRef!.value));
	const discardEdit = () => (setEditing(false), (inputRef!.value = props.title));

	const handleClick = (ev: MouseEvent) => {
		if (editing()) return;
		// Don't edit if user is selecting text!!!!!!!
		if (isSelectingSelf(h2Ref!)) return;

		const caretOffset = getCaretOffset(ev.clientX, ev.clientY) ?? 0;
		startEdit(caretOffset);
	};

	createEffect(() => console.log("title change", props.title));

	// Accesibility
	const handleKeyDown = (ev: KeyboardEvent) => (ev.key === "Enter" || ev.key === " ") && startEdit();

	return (
		<div class="widget-title">
			<input
				ref={inputRef!}
				style={{display: editing() ? undefined : "none"}}
				type="text"
				// prevent blur from triggering when input is hidden
				onBlur={() => editing() && stopEdit()}
				onKeyDown={(v) => (v.key === "Enter" && stopEdit(), v.key === "Escape" && discardEdit())}
				value={props.title}
			/>
			<h2
				ref={h2Ref!}
				tabIndex="0"
				style={{display: editing() ? "none" : undefined}}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
			>
				<span>{props.title}</span>
			</h2>
		</div>
	);
}

function typeToDefautTitle(type: WidgetProps["type"]) {
	switch (type) {
		case "chat":
			return "Chat";
		case "character-chat":
			return "Character Chat";
		case "character-manager":
			return "Character Manager";
		case "sort":
			return "Sort";
		case "empty":
			return "Empty";
		case "ss":
			return "SS";
	}
}
