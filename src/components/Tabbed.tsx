import {Accessor, createMemo, createSignal, For, JSX, mapArray, Match, Show, Switch} from "solid-js";
import "./Tabbed.css";

export type TabbedButtonContext<T> = {
	setTab: (options: {tab: T; index?: never} | {tab?: never; index: number}) => void;
};

export function Tabbed<T extends string>(props: {
	tabs: T[];
	children: (tab: T, index: Accessor<number>) => JSX.Element;
	aside?: JSX.Element;
	extraButtons?: Array<[JSX.Element, (context: TabbedButtonContext<T>) => void]>;
	class?: string;
}) {
	const [activeTab, setActiveTab] = createSignal<T>(props.tabs[0]);

	const handleSetTab = (options: {tab: T; index?: never} | {tab?: never; index: number}) => {
		if ("tab" in options) {
			setActiveTab(options.tab as Exclude<T, Function>);
		} else if ("index" in options) {
			setActiveTab(props.tabs[options.index] as Exclude<T, Function>);
		}
	};

	return (
		<div class={"tabbed-container" + (props.class ? " " + props.class : "")}>
			<ul class="tabbed-header">
				<For each={props.tabs}>
					{(tab) => (
						<li classList={{active: activeTab() === tab}}>
							<button onClick={() => setActiveTab(tab as Exclude<T, Function>)}>{tab}</button>
						</li>
					)}
				</For>
				<For each={props.extraButtons}>
					{([button, onClick], i) => (
						<li class="extra" classList={{
							"first-extra": i() === 0,
						}}>
							<button onClick={() => onClick({setTab: handleSetTab})}>{button}</button>
						</li>
					)}
				</For>
				{/* This is here to make the width of a header with one item and more than one item consistent (negative margin) */}
				<li inert>
					<button>&nbsp;</button>
				</li>
				<Show when={props.aside}>
					<aside class="tabbed-aside">{props.aside}</aside>
				</Show>
			</ul>
			<div class="tabbed-content">
				<Switch>
					<For each={props.tabs}>{(tab, i) => <Match when={tab === activeTab()}>{props.children(tab, i)}</Match>}</For>
				</Switch>
			</div>
		</div>
	);
}
