import {RiSystemCheckboxBlankLine} from "solid-icons/ri";
import Button from "./components/Button";
import {WidgetProps} from "./components/Widget";
import "./Nav.css";
import {BiRegularConversation} from "solid-icons/bi";
import {CgAlignCenter, CgAlignLeft, CgArrowsScrollH, CgScrollH} from "solid-icons/cg";
import {FaSolidAddressCard, FaSolidUser} from "solid-icons/fa";
import {TbSquareF1, TbSquareF1Filled} from "solid-icons/tb";
import {getStats} from "./components/hooks/useWs";
import {createSignal, onCleanup} from "solid-js";

export default function Nav(props: {
	isNoScroll: boolean;
	isAlignCenter: boolean;
	isTipsActive: boolean;
	toggleNoScroll: () => void;
	toggleAlignCenter: () => void;
	toggleTips: () => void;
	onAddWidget: (type: WidgetProps["type"]) => void;
}) {
	return (
		<nav>
			<div class="left">
				<Button
					title={props.isNoScroll ? "Enable horizontal scrolling" : "Disable horizontal scrolling"}
					class="toggle-no-scroll"
					color="accent"
					onClick={() => props.toggleNoScroll()}
				>
					{props.isNoScroll ? <CgScrollH size={"2.8rem"} /> : <CgArrowsScrollH size={"2.8rem"} />}
				</Button>
				<Button
					title={props.isAlignCenter ? "Align widgets left" : "Align widgets center"}
					class="toggle-align"
					color="accent"
					onClick={() => props.toggleAlignCenter()}
				>
					{props.isAlignCenter ? <CgAlignLeft size={"2.8rem"} /> : <CgAlignCenter size={"2.8rem"} />}
				</Button>
				<Button class="toggle-tips" color="accent" onClick={() => props.toggleTips()}>
					{props.isTipsActive ? <TbSquareF1 size={"2.33rem"} /> : <TbSquareF1Filled size={"2.33rem"} />}
				</Button>
				<TransferredSize />
			</div>
			<div class="right">
				<Button title="Add chat widget" color="accent" onClick={() => props.onAddWidget("chat")}>
					<BiRegularConversation size={"1.8rem"} />
				</Button>
				<Button
					title="Add character chat widget"
					color="accent"
					onClick={() => props.onAddWidget("character-chat")}
				>
					<FaSolidUser size={"1.5rem"} />
				</Button>
				<Button
					title="Add character manager widget"
					color="accent"
					onClick={() => props.onAddWidget("character-manager")}
				>
					<FaSolidAddressCard size={"1.5rem"} />
				</Button>
			</div>
		</nav>
	);
}

function TransferredSize() {
	const [currentStats, setCurrentStats] = createSignal(getStats());

	const handle = setInterval(() => {
		setCurrentStats(getStats());
	}, 2000);

	onCleanup(() => clearInterval(handle as any));

	return (
		<div class="transferred-bytes">
			<span class="transferred" title="Data transferred">
				{currentStats().transferred}
			</span>
			<span class="decompressed" title="Data decompressed">
				{currentStats().decompressed}
			</span>
			<span class="shorthanded" title="Unshorthanded data">
				{currentStats().shorthanded}
			</span>
		</div>
	);
}
