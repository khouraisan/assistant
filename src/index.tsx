/* @refresh reload */
import {render} from "solid-js/web";
import "./index.css";
import "./colors.css";
import App from "./App.tsx";
import hljs from "highlight.js";

const root = document.getElementById("root");

document.body.classList.add("dark");

hljs.configure({ignoreUnescapedHTML: true});

render(() => <App />, root!);
