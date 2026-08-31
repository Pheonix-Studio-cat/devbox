import { append, clear, copyText, el } from "./dom";
import { fitWithin, formatBytes } from "./tools/image";

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
  step = 1,
): HTMLLabelElement {
  const field = el("input", {
    type: "number",
    value: String(value),
    min: String(min),
    max: String(max),
    step: String(step),
    oninput: () => onChange(Number(field.value)),
  });
  return el("label", { class: "field" }, el("span", {}, label), field);
}

/** A labelled checkbox for the panel toolbar. */
export function toggle(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
  const box = el("input", {
    type: "checkbox",
    onchange: () => onChange(box.checked),
  });
  box.checked = checked;
  return el("label", { class: "field checkbox" }, box, el("span", {}, label));
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

export interface LoadedImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  name: string;
  bytes: number;
  type: string;
  /** True when the image was too large and had to be scaled down. */
  scaled: boolean;
}

export interface ImageWorkbench extends Omit<Workbench, "input"> {
  /** The image currently loaded, or null. */
  current(): LoadedImage | null;
  /** Runs when a new image is dropped, picked or pasted. */
  onImage(handler: (image: LoadedImage) => void): void;
}

/** Draws a file onto a canvas, scaled down to `maxEdge` if it is larger. */
async function drawToCanvas(file: File, maxEdge: number): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height, scaled } = fitWithin(
    { width: bitmap.width, height: bitmap.height },
    maxEdge,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser will not give us a 2D canvas.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return { canvas, width, height, name: file.name, bytes: file.size, type: file.type, scaled };
}

/**
 * A workbench whose input is an image file rather than text: drop it, pick it,
 * or paste it from the clipboard.
 */
export function createImageWorkbench(maxEdge = 1400): ImageWorkbench {
  const output = el("div", { class: "pane-body output", "aria-live": "polite" });
  const status = el("p", { class: "status" });
  const toolbar = el("div", { class: "toolbar" });
  const preview = el("div", { class: "preview" });
  const caption = el("p", { class: "muted" }, "No image loaded yet.");

  let loaded: LoadedImage | null = null;
  let runHandler: (() => void) | null = null;
  let imageHandler: ((image: LoadedImage) => void) | null = null;

  const picker = el("input", { type: "file", accept: "image/*", class: "visually-hidden" });

  const accept = async (file: File | null | undefined): Promise<void> => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      status.textContent = `${file.name} is not an image.`;
      status.className = "status error";
      return;
    }
    try {
      loaded = await drawToCanvas(file, maxEdge);
      clear(preview);
      preview.appendChild(loaded.canvas);
      const note = loaded.scaled ? ` · scaled down to fit ${maxEdge}px` : "";
      caption.textContent =
        `${loaded.name} — ${loaded.width}×${loaded.height}, ${formatBytes(loaded.bytes)}${note}`;
      status.textContent = "";
      status.className = "status";
      imageHandler?.(loaded);
    } catch {
      status.textContent = `${file.name} could not be decoded as an image.`;
      status.className = "status error";
    }
  };

  picker.addEventListener("change", () => void accept(picker.files?.[0]));

  const dropzone = el(
    "div",
    {
      class: "dropzone",
      tabindex: "0",
      role: "button",
      "aria-label": "Choose an image",
      onclick: () => picker.click(),
      onkeydown: (event: Event) => {
        const key = (event as KeyboardEvent).key;
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          picker.click();
        }
      },
      ondragover: (event: Event) => {
        event.preventDefault();
        dropzone.classList.add("over");
      },
      ondragleave: () => dropzone.classList.remove("over"),
      ondrop: (event: Event) => {
        event.preventDefault();
        dropzone.classList.remove("over");
        void accept((event as DragEvent).dataTransfer?.files?.[0]);
      },
    },
    el("strong", {}, "Drop an image here"),
    el("span", { class: "muted" }, "or click to choose · paste with Ctrl/Cmd+V"),
    picker,
  );

  window.addEventListener("paste", (event) => {
    const file = event.clipboardData?.files?.[0];
    if (file && dropzone.isConnected) void accept(file);
  });

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

  const root = el(
    "div",
    { class: "workbench" },
    toolbar,
    el(
      "div",
      { class: "panes" },
      el(
        "section",
        { class: "pane" },
        el("header", { class: "pane-head" }, el("h3", {}, "Image")),
        el("div", { class: "pane-body" }, dropzone, preview, caption),
      ),
      el(
        "section",
        { class: "pane" },
        el(
          "header",
          { class: "pane-head" },
          el("h3", {}, "Result"),
          el("div", { class: "pane-actions" }, copyButton),
        ),
        output,
      ),
    ),
    status,
  );

  return {
    root,
    toolbar,
    current: () => loaded,
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
    onImage(handler) {
      imageHandler = (image) => {
        handler(image);
        runHandler?.();
      };
    },
  };
}
