import "./styles.css";
import { clear, el } from "./dom";
import { PANELS, type Panel } from "./panels";

const STORAGE_KEY = "devbox:active-panel";

function rememberPanel(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private browsing or blocked storage — the app works fine without it.
  }
}

function lastPanelId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function panelFromHash(): Panel | undefined {
  const id = window.location.hash.replace(/^#\/?/, "");
  return PANELS.find((panel) => panel.id === id);
}

function mount(): void {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) throw new Error("Missing #app container");

  const nav = el("nav", { class: "nav", "aria-label": "Tools" });
  const stage = el("main", { class: "stage" });
  const heading = el("h2", { class: "stage-title" });
  const blurb = el("p", { class: "stage-blurb" });
  const body = el("div", { class: "stage-body" });
  stage.append(heading, blurb, body);

  const buttons = new Map<string, HTMLButtonElement>();
  // Panels keep their DOM (and whatever you typed) while you switch tabs.
  const rendered = new Map<string, HTMLElement>();

  let activeId: string | null = null;

  const show = (panel: Panel, updateHash = true): void => {
    // Setting the hash below re-enters through `hashchange`; without this guard
    // every click would render the panel twice.
    if (panel.id === activeId) return;
    activeId = panel.id;

    heading.textContent = panel.name;
    blurb.textContent = panel.blurb;

    let view = rendered.get(panel.id);
    if (!view) {
      view = panel.render();
      rendered.set(panel.id, view);
    }
    clear(body);
    body.appendChild(view);

    for (const [id, button] of buttons) {
      button.classList.toggle("active", id === panel.id);
      button.setAttribute("aria-current", id === panel.id ? "page" : "false");
    }

    rememberPanel(panel.id);
    if (updateHash && window.location.hash !== `#${panel.id}`) {
      window.location.hash = panel.id;
    }
  };

  for (const panel of PANELS) {
    const button = el(
      "button",
      { type: "button", class: "nav-item", onclick: () => show(panel) },
      el("span", { class: "nav-name" }, panel.name),
      el("span", { class: "nav-blurb" }, panel.blurb),
    );
    buttons.set(panel.id, button);
    nav.appendChild(button);
  }

  const header = el(
    "header",
    { class: "masthead" },
    el("h1", {}, "Devbox"),
    el(
      "p",
      {},
      "Everyday developer tools that run entirely in this tab. Nothing you paste is uploaded, logged, or stored.",
    ),
  );

  const footer = el(
    "footer",
    { class: "footer" },
    el("span", {}, "Works offline · No tracking · Apache-2.0"),
    el("kbd", {}, "Ctrl/Cmd + Enter"),
    el("span", {}, "runs the current tool"),
  );

  app.append(header, el("div", { class: "layout" }, nav, stage), footer);

  const fallback = PANELS.find((panel) => panel.id === lastPanelId());
  show(panelFromHash() ?? fallback ?? PANELS[0]!, false);

  window.addEventListener("hashchange", () => {
    const panel = panelFromHash();
    if (panel) show(panel, false);
  });
}

mount();
