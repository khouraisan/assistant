import {Portal} from "solid-js/web";
import "./Button.css";
import {children, createEffect, createSignal, JSX, onCleanup, onMount, Show} from "solid-js";

type ButtonProps = {
	title?: string;
	children?: JSX.Element;
	// Called on click or when the timed timer is up
	onClick: (ev: Omit<Event, "currentTarget"> & {_currentTarget: HTMLElement}) => void;
	// Called if user stops holding the button while the timer is active
	onTimedCancel?: () => void;
	disabled?: boolean;
	timed?: number;
	color?: "primary" | "secondary" | "accent" | "accent-light";
	class?: string;
	stopPropagation?: boolean;
};

export default function Button(props: ButtonProps) {
	let timeout: any | undefined;
	let buttonRef: HTMLButtonElement;
	const [active, setActive] = createSignal(false);

	// to fix a bug in character picker u know that one
	let preventNextClick = false;

	const handleOnClick = (ev: Event) => {
		if (props.stopPropagation) ev.stopPropagation();
		if (props.timed) return;
		if (preventNextClick) {
			preventNextClick = false;
			return;
		}
		const target = ev.currentTarget as HTMLElement;
		// @ts-ignore
		ev._currentTarget = target;
		// @ts-ignore
		props.onClick(ev);
	};

	const startTimed = (ev: Event) => {
		if (!props.timed) return;
		const target = ev.currentTarget as HTMLElement;
		clearTimed(false);
		setActive(true);
		timeout = setTimeout(() => {
			// @ts-ignore
			ev._currentTarget = target;
			// @ts-ignore
			props.onClick(ev);
			clearTimed(true);
			timeout = undefined;
			preventNextClick = true;
		}, props.timed);
	};

	const clearTimed = (ranOut: boolean) => {
		setActive(false);
		if (timeout) {
			if (!ranOut) {
				props.onTimedCancel?.();
			}
			clearTimeout(timeout);
			timeout = undefined;
		}
	};

	const clearTimedRanOutFalse = () => clearTimed(false);

	const handleKeyDown = (ev: KeyboardEvent) => {
		if (!props.timed) return;
		if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
			startTimed(ev);
		}
	};

	const handleKeyUp = (ev: KeyboardEvent) => {
		if (!props.timed) return;
		if (ev.key === "Enter") {
			clearTimed(false);
		}
	};

	const handleMouseDown = (ev: MouseEvent) => {
		if (!props.timed || ev.button !== 0) return;
		startTimed(ev);
	};

	let progressRef: HTMLDivElement;

	createEffect(() => {
		if (!(props.timed && active() && window.matchMedia("(pointer: coarse)").matches)) return;
		const t1 = performance.now();
		setTimeout(() => {
			if (!props.timed) return;

			// this is 100ms in chrome!!!! wtf!
			const t2 = performance.now();

			progressRef!.classList.add("active");
			progressRef!.style.transitionDuration = `${props.timed - (t2 - t1)}ms`;
		}, 0);
	});

	return (
		<button
			ref={buttonRef!}
			classList={{
				timed: props.timed !== undefined,
				[props.color!]: true,
				[props.class!]: true,
				active: active(),
			}}
			style={props.timed !== undefined ? {"transition-duration": `${props.timed}ms`} : undefined}
			title={props.title}
			disabled={props.disabled}
			onClick={handleOnClick}
			onDblClick={(ev) => props.stopPropagation && ev.stopPropagation()}
			onKeyDown={handleKeyDown}
			onKeyUp={handleKeyUp}
			// onMouseDown={handleMouseDown}
			// onMouseLeave={clearTimedRanOutFalse}
			// onMouseUp={clearTimedRanOutFalse}
			onPointerDown={handleMouseDown}
			onPointerLeave={clearTimedRanOutFalse}
			onPointerUp={clearTimedRanOutFalse}
			onFocusOut={clearTimedRanOutFalse}
			on:contextmenu={{
				capture: true,
				handleEvent(ev) {
					console.log("contextmenu", ev.target);
					ev.stopImmediatePropagation();
					ev.preventDefault();
				},
			}}
		>
			<Show when={props.timed && active() && window.matchMedia("(pointer: coarse)").matches}>
				<Portal mount={document.getElementById("button-progress-slot")!}>
					<div class="progress-popper" ref={progressRef!} />
				</Portal>
			</Show>
			{props.children}
		</button>
	);
}
