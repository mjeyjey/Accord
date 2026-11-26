import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { UiProvider } from "./components/ui";
import { applyTheme } from "./lib/theme";
import "./styles.css";
import "./main.css";
history.scrollRestoration = "manual";
applyTheme();
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <UiProvider>
      <App />
    </UiProvider>
  </BrowserRouter>,
);
let fieldN = 0;
const nameFields = () =>
  document
    .querySelectorAll(
      "input:not([id]):not([name]), select:not([id]):not([name]), textarea:not([id]):not([name])",
    )
    .forEach((el) => el.setAttribute("name", `field-${++fieldN}`));
new MutationObserver(nameFields).observe(document.body, {
  childList: true,
  subtree: true,
});
