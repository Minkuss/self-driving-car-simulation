import "./style.css";
import { startApp } from "./app";

const container = document.querySelector<HTMLElement>("#app");
if (container === null) {
  throw new Error("Application container is missing.");
}

startApp(container);
