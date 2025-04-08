/* @refresh reload */

import {createSignal, For, onCleanup, onMount} from "solid-js";
import "./SortWidget.css";
import Sortable from "sortablejs";

export function SortWidget() {
	let widgetRef: HTMLDivElement;

	const [items, setItems] = createSignal([
		{id: 1, title: "item 1"},
		{id: 2, title: "item 2"},
		{id: 3, title: "item 3"},
	]);

	let sortables: Sortable[] = [];
	onMount(() => {
		for (const ol of widgetRef!.querySelectorAll("ol")) {
			sortables.push(
				new Sortable(ol, {
					group: "nested",
					animation: 67,
					fallbackOnBody: true,
					swapThreshold: 0.65,
					onEnd: (ev) => {
						console.log("end", {
							item: ev.item,
							to: ev.to,
							from: ev.from,
							oldIndex: ev.oldIndex,
							newIndex: ev.newIndex,
							oldDraggableIndex: ev.oldDraggableIndex,
							newDraggableIndex: ev.newDraggableIndex,
							clone: ev.clone,
							pullMod: ev.pullMode,
						});
					},
				})
			);
		}
		console.log("mounted", sortables);
	});

	onCleanup(() => sortables.forEach((v) => v.destroy()));

	return (
		<div ref={widgetRef!} class="sort-widget">
			<ol class="sort-widget-list">
				<li>test 11</li>
				<li>test 2</li>
				<li>test 3</li>
				<li>
					test 4
					<ol class="sort-widget-list">
						<li>test 5</li>
					</ol>
				</li>
			</ol>
		</div>
	);
}

function itemToColor(v: string) {
	switch (v) {
		case "item 1":
			return "red";
		case "item 2":
			return "green";
		case "item 3":
			return "blue";
	}
}
