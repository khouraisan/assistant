import {createEffect, createSignal, JSX, Show} from "solid-js";
import "./Slider.css";

export default function Slider(props: {
	title?: string;
	step: number;
	min: number;
	max: number;
	value: number;
	numberInput?: boolean;
	disabled?: boolean;
	hideNumbers?: boolean;
	onChange: (value: number) => void;
}) {
	// TODO: input type number jank

	const [numberInputValue, setNumberInputValue] = createSignal(props.value);

	const handleNumberInput: JSX.InputEventHandlerUnion<HTMLInputElement, InputEvent> = (ev) => {
		console.log(ev.detail);
		// setNumberInputValue(parseFloat((ev.target as HTMLInputElement).value));
	};

	const handleBlur: JSX.FocusEventHandlerUnion<HTMLInputElement, FocusEvent> = (ev) => {
		const v = parseFloat(ev.target.value);
		const clamped = Math.min(props.max, Math.max(props.min, v));

		ev.target.value = clamped.toString();
		props.onChange(clamped);
	};

	const handleKeyDown: JSX.EventHandlerUnion<HTMLInputElement, KeyboardEvent> = (ev) => {
		if (ev.key === "Enter") {
			ev.currentTarget.blur();
		}
	};

	createEffect(() => {
		// props.onChange(numberInputValue());
	});

	return (
		<label
			title={props.title}
			classList={{
				"slider-container": true,
				"hide-numbers": props.hideNumbers,
			}}
		>
			<div>{props.title}</div>
			<input
				disabled={props.disabled}
				type="range"
				min={props.min}
				max={props.max}
				step={props.step}
				value={props.value}
				onInput={(ev) => props.onChange(parseFloat((ev.target as HTMLInputElement).value))}
			/>
			<Show when={props.numberInput}>
				<input
					disabled={props.disabled}
					type="number"
					value={props.value}
					min={props.min}
					max={props.max}
					step={props.step}
					onInput={handleNumberInput}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
				/>
			</Show>
		</label>
	);
}
