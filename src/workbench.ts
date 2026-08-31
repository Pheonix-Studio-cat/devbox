import { append, clear, copyText, el } from "./dom";

export interface Workbench {
  root: HTMLElement;
  input: HTMLTextAreaElement;
  toolbar: HTMLElement;
  /** Renders plain text into the output pane. */
  setOutput(text: string): void;
  /** Renders arbitrary nodes into the output pane. */
  setContent(...nodes: Array<Node | string>): void;
  setError(message: string): void;
  setStatus(message: string): void;
  /** Registers the action fired by the primary button and Ctrl/Cmd+Enter. */
  onRun(handler: () => void): void;
}

export interface WorkbenchOptions {
  inputLabel?: string;
  placeholder?: string;
  /** Hides the input pane for generators that take no text. */
  hideInput?: boolean;
  sample?: string;
}

export function createWorkbench(options: WorkbenchOptions = {}): Workbench {
  const input = el("textarea", {
    class: "pane-body input",
    spellcheck: "false",
    autocapitalize: "off",
    autocomplete: "off",
    placeholder: options.placeholder ?? "Paste here…",
    "aria-label": options.inputLabel ?? "Input",
  });

  const output = el("div", { class: "pane-body output", "aria-live": "polite" });
  const status = el("p", { class: "status" });
  const toolbar = el("div", { class: "toolbar" });

  let runHandler: (() => void) | null = null;

  const copyButton = el(
    "button",
    {
      type: "button",
      class: "ghost",
      onclick: async () => {
        const copied = await copyText(output.textContent ?? "");
        copyButton.textContent = copied ? "Copied" : "Copy failed";
        setTimeout(() => (copyButton.textContent = "Copy"), 1200);
      },
    },
    "Copy",
  );

  const sampleButton = options.sample
    ? el(
        "button",
        {
          type: "button",
          class: "ghost",
          onclick: () => {
            input.value = options.sample ?? "";
            runHandler?.();
          },
        },
        "Load sample",
      )
    : null;

  const clearButton = el(
    "button",
    {
      type: "button",
      class: "ghost",
      onclick: () => {
        input.value = "";
        clear(output);
        status.textContent = "";
        status.className = "status";
        input.focus();
      },
    },
    "Clear",
  );

  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runHandler?.();
    }
  });

  const inputPane = el(
    "section",
    { class: "pane" },
    el(
      "header",
      { class: "pane-head" },
      el("h3", {}, options.inputLabel ?? "Input"),
      el("div", { class: "pane-actions" }, sampleButton, clearButton),
    ),
    input,
  );

  const outputPane = el(
    "section",
    { class: "pane" },
    el(
      "header",
      { class: "pane-head" },
      el("h3", {}, "Result"),
      el("div", { class: "pane-actions" }, copyButton),
    ),
    output,
  );

  const root = el(
    "div",
    { class: "workbench" },
    toolbar,
    el("div", { class: options.hideInput ? "panes single" : "panes" },
      options.hideInput ? null : inputPane,
      outputPane),
    status,
  );

  return {
    root,
    input,
    toolbar,
    setOutput(text) {
      clear(output);
      output.appendChild(el("pre", {}, text));
      status.textContent = "";
      status.className = "status";
    },
    setContent(...nodes) {
      clear(output);
      append(output, nodes);
      status.textContent = "";
      status.className = "status";
    },
    setError(message) {
      clear(output);
      status.textContent = message;
      status.className = "status error";
    },
    setStatus(message) {
      status.textContent = message;
      status.className = "status";
    },
    onRun(handler) {
      runHandler = handler;
    },
  };
}

/** A labelled button for the panel toolbar. */
export function action(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  return el("button", { type: "button", class: primary ? "primary" : "", onclick: onClick }, label);
}

/** A labelled `<select>` for the panel toolbar. */
export function choice(
  label: string,
  values: readonly string[],
  onChange: (value: string) => void,
): HTMLLabelElement {
  const select = el(
    "select",
    { onchange: () => onChange(select.value) },
    ...values.map((value) => el("option", { value }, value)),
  );
  return el("label", { class: "field" }, el("span", {}, label), select);
}

/** A labelled number input for the panel toolbar. */
export function number(
  label: string,
  value: number,
  min: number,
  max: number,
  onChange: (value: number) => void,
): HTMLLabelElement {
  const field = el("input", {
    type: "number",
    value: String(value),
    min: String(min),
    max: String(max),
    oninput: () => onChange(Number(field.value)),
  });
  return el("label", { class: "field" }, el("span", {}, label), field);
}

/** Renders key/value rows as a definition list. */
export function pairs(entries: ReadonlyArray<readonly [string, string]>): HTMLElement {
  const list = el("dl", { class: "pairs" });
  for (const [key, value] of entries) {
    list.appendChild(el("dt", {}, key));
    list.appendChild(el("dd", {}, value));
  }
  return list;
}
