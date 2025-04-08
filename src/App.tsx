import {Toaster, type ToasterOptions, ToastProvider} from "solid-notifications";
import "./App.css";
import Widget, {WidgetProps} from "./components/Widget";
import Nav from "./Nav";
import WsContext from "./wsContext";
import {useChatWebsocket} from "./components/hooks/useWs";
import {createEffect, createSignal, For, onCleanup} from "solid-js";
import {F1Tips} from "./components/misc/F1Tips";

const toasterOptions: ToasterOptions = {
	positionX: "right",
	positionY: "top",
	duration: 4000,
	offsetY: 20,
	dismissOnClick: true,
	theme: "dark",
	pauseOnWindowInactive: false,
	renderOnWindowInactive: true,
};

export default function App() {
	return (
		<ToastProvider>
			<ToastyApp />
		</ToastProvider>
	);
}

function ToastyApp() {
	let widgetFlashRef: HTMLDivElement;

	const hook = useChatWebsocket();

	const [widgets, setWidgets] = createSignal<WidgetProps["type"][]>(["chat"]);
	// const [widgets, setWidgets] = createSignal<WidgetProps["type"][]>(["character-chat"]);
	// const [widgets, setWidgets] = createSignal<WidgetProps["type"][]>(["character-manager"]);
	const [isNoScroll, setIsNoScroll] = createSignal(false);
	const [isAlignCenter, setIsAlignCenter] = createSignal(true);
	const [tipsActive, setTipsActive] = createSignal(true);

	let timeout: any = undefined;
	createEffect((oldLen: number) => {
		const newLen = widgets().length;
		if (oldLen < newLen) {
			widgetFlashRef!.classList.add("animate");
			clearTimeout(timeout);
			timeout = setTimeout(() => widgetFlashRef!.isConnected && widgetFlashRef!.classList.remove("animate"), 333);
		}
		return newLen;
	}, widgets().length);

	const handleBodyClick = (ev: PointerEvent) => {
		const el = document.querySelector("#button-progress-slot") as HTMLDivElement;
		el.style.left = `${ev.clientX}px`;
		el.style.top = `${ev.clientY}px`;

		const w = window.innerWidth;
		const h = window.innerWidth;

		el.classList.remove("top", "bottom", "left", "right");

		if (ev.clientX < 50) {
			el.classList.add("right");
		}

		if (ev.clientY < 130) {
			el.classList.add("bottom");
		}

		if (ev.clientX > w - 50) {
			el.classList.add("left");
		}

		if (ev.clientY > h - 130) {
			el.classList.add("top");
		}
	};

	document.body.addEventListener("pointerdown", handleBodyClick);
	onCleanup(() => document.body.removeEventListener("pointerdown", handleBodyClick));

	return (
		<WsContext.Provider value={hook}>
			<Toaster {...toasterOptions} />
			<F1Tips active={tipsActive()} />
			<div id="button-progress-slot"></div>
			<Nav
				isNoScroll={isNoScroll()}
				isTipsActive={tipsActive()}
				isAlignCenter={isAlignCenter()}
				toggleNoScroll={() => setIsNoScroll(!isNoScroll())}
				toggleAlignCenter={() => setIsAlignCenter(!isAlignCenter())}
				toggleTips={() => setTipsActive(!tipsActive())}
				onAddWidget={(type) => setWidgets([...widgets(), type])}
			/>
			<div
				id="main-wrapper"
				classList={{
					// pretty: !window.matchMedia("(prefers-reduced-motion)").matches,
					pretty: false,
					"no-scroll": isNoScroll(),
					"align-center": isAlignCenter(),
				}}
			>
				<main>
					<For each={widgets()}>
						{(type, i) => (
							<Widget
								// I wish it was possible to disable a button in pure CSS
								isLastWidget={i() === widgets().length - 1}
								isNoScrollActive={isNoScroll()}
								isAlignCenterActive={isAlignCenter()}
								index={i()}
								type={type}
								onClose={() => setWidgets((prev) => prev.filter((_, j) => i() !== j))}
							/>
						)}
					</For>
				</main>
				<div ref={widgetFlashRef!} id="widget-flash" role="presentation" />
			</div>
			<footer></footer>
		</WsContext.Provider>
	);
}
