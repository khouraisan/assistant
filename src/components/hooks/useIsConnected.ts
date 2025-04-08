import {useWs} from "../../wsContext";

export function useIsConnected() {
	const ws = useWs();

	const signal = () => {
		if (ws === undefined) {
			console.warn("useIsConnected: ws is undefined");
			return false;
		}
		return ws.isConnected();
	};

	return signal;
}
