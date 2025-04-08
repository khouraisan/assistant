import {createContext, useContext} from "solid-js";
import {useChatWebsocket} from "./components/hooks/useWs";

const WsContext = createContext<ReturnType<typeof useChatWebsocket>>();

export function useWs() {
	return useContext(WsContext);
}

export default WsContext;
