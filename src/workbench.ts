import { append, clear, copyText, el } from "./dom";
import { fitWithin, formatBytes } from "./tools/image";
import { isSvg, readSvgSize, renderSize } from "./tools/svg";

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
  selected?: string,
): HTMLLabelElement {
  const select = el(
    "select",
    { onchange: () => onChange(select.value) },
    ...values.map((value) => el("option", { value }, value)),
  );
  if (selected !== undefined) select.value = selected;
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
    // Clearing the field to type a new number briefly leaves it empty, which
    // reads as 0 and would be acted on — rendering at one pixel, generating
    // nothing, indenting by none. An empty or unparseable field means "not yet",
    // and anything else is held inside the range the control advertises.
    oninput: () => {
      const raw = field.value.trim();
      if (raw === "") return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      onChange(Math.min(max, Math.max(min, parsed)));
    },
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
  /** The SVG's own markup, when the file was one; otherwise null. */
  svgSource: string | null;
}

export interface ImageWorkbench extends Omit<Workbench, "input"> {
  /** The image currently loaded, or null. */
  current(): LoadedImage | null;
  /** Runs when a new image is dropped, picked or pasted. */
  onImage(handler: (image: LoadedImage) => void): void;
  /**
   * Draws the loaded SVG again at a different size. Returns false when the
   * loaded file is not an SVG, where size is fixed by the pixels themselves.
   */
  redrawSvg(longEdge: number): Promise<boolean>;
  /**
   * Counts loads, successful or not. A panel doing asynchronous work captures
   * this before it starts and drops its result if the number has moved on —
   * otherwise a slow encode lands on top of a newer image, or wipes the error
   * from a file that would not open.
   */
  revision(): number;
}

function blankCanvas(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser will not give us a 2D canvas.");
  return context;
}

/**
 * Rasterises an SVG at a chosen size.
 *
 * An SVG has no pixels until something decides how many, so the caller names a
 * long edge and the file's own proportions do the rest. It goes through an
 * <img>, not createImageBitmap, which cannot decode SVG in every browser — and
 * an SVG loaded as an image runs no scripts and fetches nothing, which is the
 * safe way to draw a file someone handed us.
 */
async function drawSvgToCanvas(file: File, longEdge: number): Promise<LoadedImage> {
  const source = await file.text();
  const stated = readSvgSize(source);
  // No stated size is not a failure: fall back to a square and let the person
  // pick the edge, which is the only honest default.
  const intrinsic = stated.ok ? stated.value : { width: 1, height: 1, fromViewBox: false };
  const { width, height } = renderSize(intrinsic, longEdge);

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.width = width;
    image.height = height;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The SVG could not be drawn."));
      image.src = url;
    });

    const context = blankCanvas(width, height);
    context.drawImage(image, 0, 0, width, height);
    return {
      canvas: context.canvas,
      width,
      height,
      name: file.name,
      bytes: file.size,
      type: "image/svg+xml",
      scaled: false,
      svgSource: source,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws a file onto a canvas, scaled down to `maxEdge` if it is larger. */
async function drawToCanvas(file: File, maxEdge: number, svgEdge: number): Promise<LoadedImage> {
  if (isSvg(file.name, file.type)) return drawSvgToCanvas(file, svgEdge);

  const bitmap = await createImageBitmap(file);
  const { width, height, scaled } = fitWithin(
    { width: bitmap.width, height: bitmap.height },
    maxEdge,
  );

  const context = blankCanvas(width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return {
    canvas: context.canvas,
    width,
    height,
    name: file.name,
    bytes: file.size,
    type: file.type,
    scaled,
    svgSource: null,
  };
}

/**
 * A workbench whose input is an image file rather than text: drop it, pick it,
 * or paste it from the clipboard.
 */
export function createImageWorkbench(maxEdge = 1400, svgEdge = 1024): ImageWorkbench {
  const output = el("div", { class: "pane-body output", "aria-live": "polite" });
  const status = el("p", { class: "status" });
  const toolbar = el("div", { class: "toolbar" });
  const preview = el("div", { class: "preview" });
  const caption = el("p", { class: "muted" }, "No image loaded yet.");

  let loaded: LoadedImage | null = null;
  let lastFile: File | null = null;
  // Decoding is asynchronous, so two loads can overtake each other. Only the
  // newest one is allowed to put its result on screen.
  let generation = 0;
  let renderEdge = svgEdge;
  let runHandler: (() => void) | null = null;
  let imageHandler: ((image: LoadedImage) => void) | null = null;

  // Some systems hand over an SVG with an empty type, so the extension is
  // offered too.
  const picker = el("input", {
    type: "file",
    accept: "image/*,.svg",
    class: "visually-hidden",
  });

  const accept = async (file: File | null | undefined): Promise<void> => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !isSvg(file.name, file.type)) {
      status.textContent = `${file.name} is not an image.`;
      status.className = "status error";
      return;
    }
    const mine = ++generation;
    try {
      const drawn = await drawToCanvas(file, maxEdge, renderEdge);
      if (mine !== generation) return;

      loaded = drawn;
      lastFile = file;
      clear(preview);
      preview.appendChild(drawn.canvas);
      const note = drawn.svgSource
        ? ` · drawn at ${drawn.width}×${drawn.height}, and it has no size of its own`
        : drawn.scaled
          ? ` · scaled down to fit ${maxEdge}px`
          : "";
      caption.textContent =
        `${drawn.name} — ${drawn.width}×${drawn.height}, ${formatBytes(drawn.bytes)}${note}`;
      status.textContent = "";
      status.className = "status";
      imageHandler?.(drawn);
    } catch {
      if (mine !== generation) return;
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
    revision: () => generation,
    async redrawSvg(longEdge) {
      if (!lastFile || !loaded?.svgSource) return false;
      renderEdge = longEdge;
      await accept(lastFile);
      return true;
    },
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

export interface DualWorkbench extends Omit<Workbench, "input"> {
  left: HTMLTextAreaElement;
  right: HTMLTextAreaElement;
}

/** A workbench that compares two texts rather than transforming one. */
export function createDualWorkbench(
  leftLabel: string,
  rightLabel: string,
  samples?: readonly [string, string],
): DualWorkbench {
  const field = (label: string): HTMLTextAreaElement =>
    el("textarea", {
      class: "pane-body input short",
      spellcheck: "false",
      autocapitalize: "off",
      "aria-label": label,
      placeholder: "Paste here…",
    });

  const left = field(leftLabel);
  const right = field(rightLabel);
  const output = el("div", { class: "pane-body output", "aria-live": "polite" });
  const status = el("p", { class: "status" });
  const toolbar = el("div", { class: "toolbar" });

  let runHandler: (() => void) | null = null;

  for (const box of [left, right]) {
    box.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        runHandler?.();
      }
    });
  }

  const pane = (label: string, box: HTMLTextAreaElement): HTMLElement =>
    el(
      "section",
      { class: "pane" },
      el("header", { class: "pane-head" }, el("h3", {}, label)),
      box,
    );

  const sampleButton = samples
    ? el(
        "button",
        {
          type: "button",
          class: "ghost",
          onclick: () => {
            left.value = samples[0];
            right.value = samples[1];
            runHandler?.();
          },
        },
        "Load sample",
      )
    : null;

  const root = el(
    "div",
    { class: "workbench" },
    toolbar,
    el("div", { class: "panes" }, pane(leftLabel, left), pane(rightLabel, right)),
    el(
      "section",
      { class: "pane" },
      el(
        "header",
        { class: "pane-head" },
        el("h3", {}, "Result"),
        el("div", { class: "pane-actions" }, sampleButton),
      ),
      output,
    ),
    status,
  );

  return {
    root,
    left,
    right,
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
