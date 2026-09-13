import { randomSeed } from "./prng.js";
import {
  type RoughOptions,
  roughCheckmark,
  roughArrow,
  roughCircle,
  roughEllipse,
  roughLine,
  roughPieSlice,
  roughRoundedRect,
  scribbleFill,
  variants,
} from "./rough.js";

export interface DrawablyOptions {
  seed?: number;
  roughness?: number;
  boil?: number;
  stroke?: string;
  fill?: string;
  paper?: string;
  width?: number;
}

export interface Sketch {
  resketch(seed?: number): void;
  destroy(): void;
}

export interface DrawablyDoubleQuoteOptions extends DrawablyOptions {
  direction?: "open" | "close";
}

/** Decorative double quotation mark; quote content stays in native HTML. */
export function drawablyDoubleQuote(el: HTMLElement, opts: DrawablyDoubleQuoteOptions = {}): Sketch {
  if (!(el instanceof HTMLElement)) throw new Error("drawably: expected an HTMLElement");
  const direction = opts.direction ?? "open";
  if (direction !== "open" && direction !== "close")
    throw new Error("drawably: double quote direction must be open or close");
  const mark = document.createElement("span");
  mark.className = `drawably-double-quote drawably-double-quote--${direction}`;
  mark.setAttribute("aria-hidden", "true");
  el.append(mark);
  // Two comma-shaped strokes, tuned to the default 3rem square. Opening
  // marks rotate the same sketch so paired punctuation shares one hand.
  const layers: Layer[] = [
    { className: "drawably-outline", gen: (w, h, o) => [0.3, 0.7].map((x, i) => {
      const ro = { ...o, seed: o.seed + i };
      return roughLine(w * (x + 0.075), h * 0.37, w * (x + 0.04), h * 0.57, ro) +
        roughLine(w * (x + 0.04), h * 0.57, w * (x - 0.08), h * 0.68, ro);
    }).join("") },
    { className: "drawably-double-quote-ink", gen: (w, h, o) => [0.3, 0.7].map((x, i) =>
      roughEllipse(w * x, h * 0.35, w * 0.11, h * 0.12, { ...o, seed: o.seed + i }),
    ).join("") },
  ];
  const sketch = attachChrome(mark, layers, opts, false);
  let destroyed = false;
  return {
    resketch(seed) { if (!destroyed) sketch.resketch(seed); },
    destroy() { if (!destroyed) { destroyed = true; sketch.destroy(); mark.remove(); } },
  };
}

export interface DrawablyMilestone {
  label: string;
  value: number;
}

export interface DrawablyProgressBarOptions extends DrawablyOptions {
  value?: number;
  max?: number;
  label?: string;
  milestones?: readonly DrawablyMilestone[];
}

export interface ProgressBarSketch extends Sketch {
  setValue(value: number): void;
  setMilestones(milestones: readonly DrawablyMilestone[]): void;
}

interface Layer {
  className: string;
  pathLength?: boolean;
  gen(w: number, h: number, o: RoughOptions): string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const INSET = 3;

function applyTheme(el: HTMLElement | SVGElement, opts: DrawablyOptions) {
  if (opts.stroke) el.style.setProperty("--drawably-stroke", opts.stroke);
  if (opts.fill) el.style.setProperty("--drawably-fill", opts.fill);
  if (opts.paper) el.style.setProperty("--drawably-paper", opts.paper);
  if (opts.width !== undefined) el.style.setProperty("--drawably-width", String(opts.width));
}

function createSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "drawably-svg");
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// each layer is drawn once per box; a control has one, an inline decoration
// has one per line it wraps onto
function paint(svg: SVGSVGElement, layers: Layer[], boxes: Box[], o: RoughOptions) {
  const w = Math.max(...boxes.map((b) => b.x + b.w));
  const h = Math.max(...boxes.map((b) => b.y + b.h));
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.textContent = "";
  for (const layer of layers) {
    boxes.forEach((box, k) => {
      const ds = variants((lo) => layer.gen(box.w, box.h, lo), { ...o, seed: o.seed + k }, o.boil ? 3 : 1);
      ds.forEach((d, i) => {
        const p = document.createElementNS(SVG_NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("class", ds.length > 1 ? `drawably-boil ${layer.className}` : layer.className);
        p.dataset.i = String(i);
        if (layer.pathLength) p.setAttribute("pathLength", "1");
        if (box.x || box.y) p.setAttribute("transform", `translate(${box.x} ${box.y})`);
        svg.append(p);
      });
    });
  }
}

function elementBox(el: HTMLElement): Box[] {
  return [{ x: 0, y: 0, w: el.offsetWidth || 120, h: el.offsetHeight || 36 }];
}

// an inline element that wraps is several boxes; its absolutely positioned
// svg lands on the first one's corner, so the svg is offset and sized to
// cover them all and each line gets its own drawing
function lineBoxes(el: HTMLElement, svg: SVGSVGElement): Box[] {
  const rects = [...el.getClientRects()];
  if (rects.length < 2) {
    svg.style.cssText = "";
    return elementBox(el);
  }
  const [first] = rects;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  svg.style.cssText = `left:${left - first.left}px;top:${top - first.top}px;width:${right - left}px;height:${bottom - top}px`;
  return rects.map((r) => ({ x: r.left - left, y: r.top - top, w: r.width, h: r.height }));
}

// ResizeObserver ignores inline boxes, so a wrapping decoration watches the
// block that lays it out
function blockAncestor(el: HTMLElement): Element | null {
  let p = el.parentElement;
  while (p && getComputedStyle(p).display === "inline") p = p.parentElement;
  return p;
}

function reducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function attachChrome(
  el: HTMLElement,
  layers: Layer[],
  opts: DrawablyOptions,
  interactive: boolean,
  inline = false,
): Sketch {
  if (!(el instanceof HTMLElement)) throw new Error("drawably: expected an HTMLElement");
  el.classList.add("drawably-host");
  applyTheme(el, opts);

  const svg = createSvg();
  el.prepend(svg);

  const roughness = opts.roughness ?? 1;
  const boil = opts.boil ?? 0.3;
  let seed = opts.seed ?? randomSeed();

  const draw = () =>
    paint(svg, layers, inline ? lineBoxes(el, svg) : elementBox(el), { seed, roughness, boil });
  draw();

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  if (inline) {
    const block = blockAncestor(el);
    if (block) ro?.observe(block);
  }

  const resketch = (s?: number) => {
    seed = s ?? randomSeed();
    draw();
  };

  const onPointer = () => resketch();
  if (interactive && !reducedMotion()) {
    el.addEventListener("pointerenter", onPointer);
    el.addEventListener("pointerdown", onPointer);
  }

  return {
    resketch,
    destroy() {
      ro?.disconnect();
      el.removeEventListener("pointerenter", onPointer);
      el.removeEventListener("pointerdown", onPointer);
      svg.remove();
      el.classList.remove("drawably-host");
    },
  };
}

// Markers need room around both endpoints; the bar fits inside their centres.
const PROGRESS_INSET = 18;
const PROGRESS_HEIGHT = 44;
const PROGRESS_BAR_HEIGHT = 14;
const PROGRESS_MARKER_RADIUS = 12;
const PROGRESS_LABEL_GAP = 8;

export function drawablyProgressBar(el: HTMLElement, opts: DrawablyProgressBarOptions = {}): ProgressBarSketch {
  if (!(el instanceof HTMLElement)) throw new Error("drawably: expected an HTMLElement");
  const max = opts.max ?? 100, roughness = opts.roughness ?? 1, boil = opts.boil ?? 0.3;
  if (!Number.isFinite(max) || max <= 0) throw new Error("drawably: progress max must be finite and positive");
  if (![roughness, boil, opts.width ?? 2].every(v => Number.isFinite(v) && v >= 0))
    throw new Error("drawably: progress stroke options must be finite and non-negative");
  function normalize(next: number): number {
    if (!Number.isFinite(next)) throw new Error("drawably: progress value must be finite");
    return Math.min(max, Math.max(0, next));
  }
  function validateMilestones(items: readonly DrawablyMilestone[]): DrawablyMilestone[] {
    if (!Array.isArray(items) || items.some(m => !m || typeof m.label !== "string" || !m.label.trim() ||
      !Number.isFinite(m.value) || m.value < 0 || m.value > max))
      throw new Error("drawably: milestones need labels and values between 0 and max");
    if (new Set(items.map(m => m.value)).size !== items.length)
      throw new Error("drawably: milestone values must be unique");
    return items.map(m => ({ ...m })).sort((a, b) => a.value - b.value);
  }
  let value = normalize(opts.value ?? 0), milestones = validateMilestones(opts.milestones ?? []);
  let seed = opts.seed ?? randomSeed(), destroyed = false;
  const wrapper = document.createElement("div");
  wrapper.className = "drawably-progress";
  applyTheme(wrapper, opts);
  const heading = document.createElement("div");
  heading.className = "drawably-progress-heading";
  const label = document.createElement("span"), percent = document.createElement("span");
  label.textContent = opts.label ?? "Progress";
  percent.setAttribute("aria-hidden", "true");
  heading.append(label, percent);
  const track = document.createElement("div");
  track.className = "drawably-host drawably-progress-track";
  track.style.height = `${PROGRESS_HEIGHT}px`;
  const native = document.createElement("progress");
  native.max = max;
  native.setAttribute("aria-label", opts.label ?? "Progress");
  const svg = createSvg();
  svg.setAttribute("focusable", "false");
  track.append(native, svg);
  const list = document.createElement("ol");
  list.className = "drawably-progress-milestones";
  list.setAttribute("aria-label", "Milestones");
  wrapper.append(heading, track, list);
  el.append(wrapper);

  function draw() {
    if (destroyed) return;
    native.value = value;
    const share = value / max;
    percent.textContent = `${Math.round(share * 1000) / 10}%`;
    const size = track.clientWidth || 300;
    const inset = Math.min(PROGRESS_INSET, size / 2), span = Math.max(0, size - inset * 2);
    const y = (PROGRESS_HEIGHT - PROGRESS_BAR_HEIGHT) / 2;
    const layers: Layer[] = [
      { className: "drawably-outline", gen: (_w, _h, o) => roughRoundedRect(inset, y, span, PROGRESS_BAR_HEIGHT, 6, o) },
      { className: "drawably-scribble drawably-progress-fill", gen: (_w, _h, o) => share && span > 4 ? scribbleFill(inset + 2, y + 2, (span - 4) * share, PROGRESS_BAR_HEIGHT - 4, o) : "" },
    ];
    milestones.forEach((m, i) => {
      const x = inset + span * m.value / max;
      layers.push({ className: "drawably-progress-marker", gen: (_w, _h, o) => roughCircle(x, PROGRESS_HEIGHT / 2, PROGRESS_MARKER_RADIUS, { ...o, seed: o.seed + i + 1 }) });
      if (value >= m.value) layers.push({ className: "drawably-progress-check", gen: (_w, _h, o) => roughCheckmark(x - 6, PROGRESS_HEIGHT / 2 - 6, 12, 12, { ...o, seed: o.seed + i + 1 }) });
    });
    paint(svg, layers, [{ x: 0, y: 0, w: size, h: PROGRESS_HEIGHT }], { seed, roughness, boil });
    list.replaceChildren();
    list.hidden = !milestones.length;
    const lanes: { end: number; height: number }[] = [];
    const entries: { item: HTMLLIElement; lane: number }[] = [];
    for (const m of milestones) {
      const item = document.createElement("li");
      item.dataset.reached = String(value >= m.value);
      const title = document.createElement("span"), detail = document.createElement("span");
      title.textContent = m.label;
      detail.className = "drawably-progress-detail";
      detail.textContent = `${Math.round(m.value / max * 1000) / 10}% · ${value >= m.value ? "Reached" : "Upcoming"}`;
      item.append(title, detail);
      list.append(item);
      const width = item.offsetWidth || Math.min(144, size);
      const height = item.offsetHeight || 48;
      const x = inset + span * m.value / max;
      const left = Math.max(0, Math.min(size - width, x - width / 2));
      let lane = lanes.findIndex(l => left >= l.end + PROGRESS_LABEL_GAP);
      if (lane < 0) { lane = lanes.length; lanes.push({ end: 0, height: 0 }); }
      lanes[lane].end = left + width;
      lanes[lane].height = Math.max(lanes[lane].height, height);
      item.style.left = `${left}px`;
      entries.push({ item, lane });
    }
    const tops: number[] = [];
    let height = 0;
    for (const lane of lanes) { tops.push(height); height += lane.height + PROGRESS_LABEL_GAP; }
    for (const entry of entries) entry.item.style.top = `${tops[entry.lane]}px`;
    list.style.height = `${Math.max(0, height - PROGRESS_LABEL_GAP)}px`;
  }
  draw();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
  observer?.observe(track);
  document.fonts?.addEventListener("loadingdone", draw);
  return {
    setValue(next) { if (!destroyed) { value = normalize(next); draw(); } },
    setMilestones(next) { if (!destroyed) { milestones = validateMilestones(next); draw(); } },
    resketch(nextSeed) { if (!destroyed) { seed = nextSeed ?? randomSeed(); draw(); } },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", draw);
      wrapper.remove();
    },
  };
}

const outlineRect =
  (r: number): Layer["gen"] =>
  (w, h, o) =>
    roughRoundedRect(INSET, INSET, w - 2 * INSET, h - 2 * INSET, r, o);

const focusRect =
  (r: number): Layer["gen"] =>
  (w, h, o) =>
    roughRoundedRect(-1, -1, w + 2, h + 2, r, o);

export type DrawablyButtonState = "idle" | "loading" | "error" | "success";

export interface DrawablyButtonOptions extends DrawablyOptions {
  variant?: "outline" | "solid" | "scribble";
  state?: DrawablyButtonState;
  tone?: "neutral" | "danger";
}

export interface ButtonSketch extends Sketch {
  setState(state: DrawablyButtonState): void;
}

export function drawablyButton(el: HTMLElement, opts: DrawablyButtonOptions = {}): ButtonSketch {
  const variant = opts.variant ?? "outline";
  const layers: Layer[] = [];
  if (variant === "solid") layers.push({ className: "drawably-blob", gen: outlineRect(8) });
  if (variant === "scribble")
    layers.push({
      className: "drawably-scribble",
      gen: (w, h, o) => scribbleFill(INSET + 2, INSET + 2, w - 2 * INSET - 4, h - 2 * INSET - 4, o),
    });
  layers.push({ className: "drawably-outline", gen: outlineRect(8) });
  layers.push({ className: "drawably-focus", gen: focusRect(10) });
  const sketch = attachChrome(el, layers, opts, true);
  el.classList.add("drawably-button", `drawably-button--${variant}`);
  if (opts.tone) el.classList.add(`drawably-button--${opts.tone}`);
  const setState = (state: DrawablyButtonState) => {
    if (state === "idle") delete el.dataset.state;
    else el.dataset.state = state;
  };
  if (opts.state) setState(opts.state);
  return {
    resketch: sketch.resketch,
    setState,
    destroy() {
      sketch.destroy();
      delete el.dataset.state;
    },
  };
}

export function drawablyCard(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  const sketch = attachChrome(el, [{ className: "drawably-outline", gen: outlineRect(10) }], opts, false);
  el.classList.add("drawably-card");
  return sketch;
}

export interface DrawablyPieDatum {
  label: string;
  value: number;
  /** CSS colour, including var(...); otherwise uses --drawably-series-1 through -6. */
  color?: string;
}

export interface DrawablyPieChartOptions extends DrawablyOptions {
  data: readonly DrawablyPieDatum[];
  showLegend?: boolean;
}

export interface PieChartSketch extends Sketch {
  setData(data: readonly DrawablyPieDatum[]): void;
}

let pieId = 0;
const PIE_TURN = Math.PI * 2;
const PIE_PALETTE = ["var(--drawably-stroke, #2724d1)", "#0f766e", "#b45309", "#8852aa", "#d12724", "#6e675f"];

function pieData(data: readonly DrawablyPieDatum[]): DrawablyPieDatum[] {
  if (!Array.isArray(data) || data.some(d => !d || typeof d.label !== "string" ||
    typeof d.value !== "number" || !Number.isFinite(d.value) || d.value < 0 ||
    (d.color !== undefined && typeof d.color !== "string")))
    throw new Error("drawably: pie data requires labels and finite, non-negative values");
  return data.map(d => ({ ...d }));
}

function piePercent(share: number): string {
  if (share > 0 && share < 0.001) return "<0.1%";
  return `${Math.round(share * 1000) / 10}%`;
}

/** Appends an owned plot and native HTML legend; preserves existing host content. */
export function drawablyPieChart(el: HTMLElement, opts: DrawablyPieChartOptions): PieChartSketch {
  if (!(el instanceof HTMLElement)) throw new Error("drawably: expected an HTMLElement");
  let data = pieData(opts?.data);
  const roughness = opts.roughness ?? 1, boil = opts.boil ?? 0.3;
  if (![roughness, boil, opts.width ?? 2].every(v => Number.isFinite(v) && v >= 0))
    throw new Error("drawably: pie roughness, boil and width must be finite and non-negative");
  let seed = opts.seed ?? randomSeed(), destroyed = false;
  const id = `drawably-pie-${++pieId}`;
  const wrapper = document.createElement("div");
  wrapper.className = "drawably-pie-chart";
  applyTheme(wrapper, opts);
  const plot = document.createElement("div");
  plot.className = "drawably-host drawably-pie-plot";
  const svg = createSvg();
  svg.setAttribute("focusable", "false");
  plot.append(svg);
  const legend = document.createElement("ul");
  legend.className = opts.showLegend === false ? "drawably-pie-legend drawably-pie-hidden" : "drawably-pie-legend";
  legend.setAttribute("aria-label", "Chart data");
  wrapper.append(plot, legend);
  el.append(wrapper);

  function draw() {
    if (destroyed) return;
    // The HTML plot reserves its square before SVG exists, including hidden mounts.
    const size = plot.clientWidth || 300;
    const center = size / 2;
    const inset = Math.max(INSET, roughness * 3 + boil + (opts.width ?? 2));
    const radius = Math.max(0, center - inset);
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.replaceChildren();
    plot.querySelectorAll(".drawably-pie-label, .drawably-pie-empty").forEach(n => n.remove());
    legend.replaceChildren();
    const defs = document.createElementNS(SVG_NS, "defs");
    svg.append(defs);
    // Scaling before summation also accepts finite values whose raw total overflows.
    const max = data.reduce((m, d) => Math.max(m, d.value), 0);
    const total = max ? data.reduce((s, d) => s + d.value / max, 0) : 0;
    let start = -Math.PI / 2;

    data.forEach((datum, index) => {
      const share = total ? (datum.value / max) / total : 0;
      const slot = index % PIE_PALETTE.length;
      const color = datum.color ?? `var(--drawably-series-${slot + 1}, ${PIE_PALETTE[slot]})`;
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "drawably-pie-swatch";
      swatch.style.setProperty("--drawably-ink", color);
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = `${datum.label}: ${piePercent(share)}`;
      item.append(swatch, label);
      legend.append(item);
      if (!share || !radius) return;
      const end = start + share * PIE_TURN;
      const group = document.createElementNS(SVG_NS, "g");
      group.classList.add("drawably-pie-slice");
      group.dataset.index = String(index);
      group.style.setProperty("--drawably-ink", color);
      const clip = document.createElementNS(SVG_NS, "clipPath");
      clip.id = `${id}-${index}`;
      clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      // Exact geometry clips the scribble; randomness changes only its pen strokes.
      if (share === 1) {
        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("cx", String(center)); circle.setAttribute("cy", String(center));
        circle.setAttribute("r", String(radius)); clip.append(circle);
      } else {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", `M${center} ${center} L${center + radius * Math.cos(start)} ${center + radius * Math.sin(start)} A${radius} ${radius} 0 ${share > 0.5 ? 1 : 0} 1 ${center + radius * Math.cos(end)} ${center + radius * Math.sin(end)} Z`);
        clip.append(path);
      }
      defs.append(clip);
      const hatch = document.createElementNS(SVG_NS, "g");
      hatch.setAttribute("clip-path", `url(#${clip.id})`);
      group.append(hatch);
      const o = { seed: seed + index, roughness, boil };
      const layers = [
        { parent: hatch, cls: "drawably-scribble", gen: (ro: RoughOptions) => scribbleFill(center - radius, center - radius, radius * 2, radius * 2, ro) },
        { parent: group, cls: "drawably-outline", gen: (ro: RoughOptions) => roughPieSlice(center, center, radius, start, end, ro) },
      ];
      for (const layer of layers) {
        const frames = variants(layer.gen, o, boil ? 3 : 1);
        frames.forEach((d, i) => {
          const path = document.createElementNS(SVG_NS, "path");
          path.setAttribute("d", d);
          path.setAttribute("class", `${layer.cls}${boil ? " drawably-boil" : ""}`);
          path.dataset.i = String(i);
          layer.parent.append(path);
        });
      }
      svg.append(group);
      // Only label wedges with room for a 3em percentage; every value stays in HTML.
      const mid = (start + end) / 2, labelRadius = share === 1 ? 0 : radius * 0.62;
      const labelWidth = (parseFloat(getComputedStyle(plot).fontSize) || 16) * 3;
      if (share === 1 || (share >= 0.08 && labelRadius * (end - start) >= labelWidth)) {
        const value = document.createElement("span");
        value.className = "drawably-pie-label";
        value.setAttribute("aria-hidden", "true");
        value.textContent = piePercent(share);
        value.style.left = `${(center + labelRadius * Math.cos(mid)) / size * 100}%`;
        value.style.top = `${(center + labelRadius * Math.sin(mid)) / size * 100}%`;
        plot.append(value);
      }
      start = end;
    });
    if (!total) {
      const empty = document.createElement("span");
      empty.className = "drawably-pie-empty";
      empty.textContent = "No data";
      plot.append(empty);
    }
  }
  draw();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
  observer?.observe(plot);
  // A late opt-in font can change which labels fit without changing the plot's box.
  const fonts = document.fonts;
  fonts?.addEventListener("loadingdone", draw);
  return {
    resketch(nextSeed) { if (!destroyed) { seed = nextSeed ?? randomSeed(); draw(); } },
    setData(nextData) { if (!destroyed) { data = pieData(nextData); draw(); } },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      fonts?.removeEventListener("loadingdone", draw);
      wrapper.remove();
    },
  };
}

function syncedControl(
  el: HTMLElement,
  type: "checkbox" | "radio",
  layers: Layer[],
  opts: DrawablyOptions,
  cls: string,
): Sketch {
  const input = el?.querySelector?.<HTMLInputElement>(`input[type="${type}"]`);
  if (!input) throw new Error(`drawably: ${cls} wrapper needs an <input type="${type}">`);
  const sync = () => {
    if (input.checked) el.dataset.checked = "";
    else delete el.dataset.checked;
  };
  sync();
  // ponytail: a radio unchecks silently when a sibling is picked — one document
  // listener re-reads state on any change instead of tracking the group
  const target = type === "radio" ? document : input;
  target.addEventListener("change", sync);
  const sketch = attachChrome(el, layers, opts, true);
  el.classList.add(cls);
  return {
    resketch: sketch.resketch,
    destroy() {
      target.removeEventListener("change", sync);
      sketch.destroy();
      el.classList.remove(cls);
      delete el.dataset.checked;
    },
  };
}

export function drawablyCheckbox(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return syncedControl(
    el,
    "checkbox",
    [
      { className: "drawably-outline", gen: outlineRect(5) },
      {
        className: "drawably-check",
        pathLength: true,
        gen: (w, h, o) => roughCheckmark(w * 0.24, h * 0.2, w * 0.52, h * 0.5, o),
      },
      { className: "drawably-focus", gen: focusRect(7) },
    ],
    opts,
    "drawably-checkbox",
  );
}

export function drawablyRadio(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return syncedControl(
    el,
    "radio",
    [
      {
        className: "drawably-outline",
        gen: (w, h, o) => roughCircle(w / 2, h / 2, Math.min(w, h) / 2 - INSET, o),
      },
      {
        className: "drawably-dot",
        gen: (w, h, o) => roughCircle(w / 2, h / 2, Math.min(w, h) * 0.18, o),
      },
      {
        className: "drawably-focus",
        gen: (w, h, o) => roughCircle(w / 2, h / 2, Math.min(w, h) / 2 + 1, o),
      },
    ],
    opts,
    "drawably-radio",
  );
}

export function drawablyToggle(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return syncedControl(
    el,
    "checkbox",
    [
      { className: "drawably-outline", gen: (w, h, o) => outlineRect((h - 2 * INSET) / 2)(w, h, o) },
      {
        className: "drawably-blob drawably-knob",
        gen: (_w, h, o) => roughCircle(h / 2, h / 2, h / 2 - INSET - 3, o),
      },
      { className: "drawably-focus", gen: focusRect(12) },
    ],
    opts,
    "drawably-toggle",
  );
}

export function drawablyDivider(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  const sketch = attachChrome(
    el,
    [{ className: "drawably-outline", gen: (w, h, o) => roughLine(INSET, h / 2, w - INSET, h / 2, o) }],
    opts,
    false,
  );
  el.classList.add("drawably-divider");
  return sketch;
}

function fieldBox(el: HTMLElement, field: string, cls: string, extra: Layer[], opts: DrawablyOptions): Sketch {
  if (!el?.querySelector?.(field)) throw new Error(`drawably: ${cls} wrapper needs a <${field}>`);
  return decoration(
    el,
    cls,
    [{ className: "drawably-outline", gen: outlineRect(6) }, ...extra, { className: "drawably-focus", gen: focusRect(8) }],
    opts,
    false,
  );
}

export function drawablyInput(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return fieldBox(el, "input", "drawably-inputbox", [], opts);
}

export function drawablyTextarea(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return fieldBox(el, "textarea", "drawably-textarea", [], opts);
}

// chevron sits in the right-hand gutter the select's CSS padding reserves;
// at this size full roughness turns the V into noise, so it takes a fraction
const CHEVRON_W = 12;
const CHEVRON_H = 6;
const CHEVRON_RIGHT = 12;
const CHEVRON_ROUGHNESS = 0.4;

// ponytail: options are measured once at attach; re-attach if they change
function reserveWidestOption(select: HTMLSelectElement) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  const cs = getComputedStyle(select);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const widest = Math.max(0, ...[...select.options].map((o) => ctx.measureText(o.text).width));
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  select.style.minWidth = `${Math.ceil(widest + pad)}px`;
}

const PICKER_RADIUS = 6;

// Chromium's base-select renders the select's children inside the picker, so
// a real SVG can sit in there like any other chrome. It has no size until the
// picker opens; the observer draws it at the size it gets. Other engines keep
// the OS popup and ignore the element.
function pickerFrame(select: HTMLSelectElement, o: () => RoughOptions) {
  const frame = createSvg();
  frame.classList.add("drawably-picker");
  select.append(frame);
  const draw = () => {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w && h) paint(frame, [{ className: "drawably-outline", gen: outlineRect(PICKER_RADIUS) }], [{ x: 0, y: 0, w, h }], o());
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(draw) : null;
  ro?.observe(frame);
  return {
    draw,
    destroy() {
      ro?.disconnect();
      frame.remove();
    },
  };
}

// the picker's check fills its 0.875em (14px) box bar a 2px inset for the
// stroke and jitter, landing at the checkbox's ~11px check size. A data URI
// can't read custom properties, so it is a mask and the CSS supplies the colour
const CHECK_BOX = 14;
const CHECK_INSET = 2;
function checkMask(o: RoughOptions): string {
  const side = CHECK_BOX - CHECK_INSET * 2;
  const d = roughCheckmark(CHECK_INSET, CHECK_INSET, side, side, o);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${CHECK_BOX} ${CHECK_BOX}'><path d='${d}' fill='none' stroke='#000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function drawablySelect(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  const chevron: Layer = {
    className: "drawably-chevron",
    gen: (w, h, o) => {
      const x = w - CHEVRON_RIGHT - CHEVRON_W;
      const y = h / 2 - CHEVRON_H / 2;
      const co = { ...o, roughness: o.roughness * CHEVRON_ROUGHNESS };
      return (
        roughLine(x, y, x + CHEVRON_W / 2, y + CHEVRON_H, co) +
        roughLine(x + CHEVRON_W / 2, y + CHEVRON_H, x + CHEVRON_W, y, { ...co, seed: o.seed + 1 })
      );
    },
  };
  let seed = opts.seed ?? randomSeed();
  const sketch = fieldBox(el, "select", "drawably-select", [chevron], { ...opts, seed });
  const select = el.querySelector("select")!;
  const roughness = opts.roughness ?? 1;
  const boil = opts.boil ?? 0.3;
  reserveWidestOption(select);
  const frame = pickerFrame(select, () => ({ seed, roughness, boil }));
  const mark = () => select.style.setProperty("--drawably-check", checkMask({ seed, roughness }));
  mark();
  return {
    resketch(s?: number) {
      seed = s ?? randomSeed();
      sketch.resketch(seed);
      frame.draw();
      mark();
    },
    destroy() {
      sketch.destroy();
      frame.destroy();
      select.style.removeProperty("min-width");
      select.style.removeProperty("--drawably-check");
    },
  };
}

export interface DrawablyBadgeOptions extends DrawablyOptions {
  variant?: "outline" | "scribble";
}

export function drawablyBadge(el: HTMLElement, opts: DrawablyBadgeOptions = {}): Sketch {
  const variant = opts.variant ?? "outline";
  const layers: Layer[] = [];
  if (variant === "scribble")
    layers.push({
      className: "drawably-scribble",
      gen: (w, h, o) => scribbleFill(INSET + 1, INSET + 1, w - 2 * INSET - 2, h - 2 * INSET - 2, o),
    });
  layers.push({ className: "drawably-outline", gen: outlineRect(2) });
  const sketch = decoration(el, "drawably-badge", layers, opts, false);
  el.classList.add(`drawably-badge--${variant}`);
  return {
    resketch: sketch.resketch,
    destroy() {
      sketch.destroy();
      el.classList.remove(`drawably-badge--${variant}`);
    },
  };
}

export interface DrawablyListOptions extends DrawablyOptions {
  marker?: "dash" | "check";
}

// marker geometry in the list's left padding (see .drawably-list); y follows
// the li's line-height so it sits on the first line
const MARKER_LEFT = -18;
const MARKER_W = 10;
const MARKER_LINE = 22;

// ponytail: only the <li> present at attach time are sketched — a
// MutationObserver would cover dynamic lists if anyone needs it
export function drawablyList(el: HTMLElement, opts: DrawablyListOptions = {}): Sketch {
  if (!(el instanceof HTMLElement)) throw new Error("drawably: expected an HTMLElement");
  const marker = opts.marker ?? "dash";
  const seed = opts.seed ?? randomSeed();
  const items = [...el.querySelectorAll<HTMLLIElement>(":scope > li")];
  const sketches = items.map((li, i) => {
    const line = () => parseFloat(getComputedStyle(li).lineHeight) || MARKER_LINE;
    const layer: Layer =
      marker === "check"
        ? {
            className: "drawably-marker",
            gen: (_w, _h, o) => roughCheckmark(MARKER_LEFT, line() / 2 - MARKER_W / 2, MARKER_W, MARKER_W, o),
          }
        : {
            className: "drawably-marker",
            gen: (_w, _h, o) => roughLine(MARKER_LEFT, line() / 2, MARKER_LEFT + MARKER_W, line() / 2, o),
          };
    return attachChrome(li, [layer], { ...opts, seed: seed + i }, false);
  });
  el.classList.add("drawably-list");
  return {
    resketch(s?: number) {
      const base = s ?? randomSeed();
      sketches.forEach((sk, i) => sk.resketch(base + i));
    },
    destroy() {
      for (const sk of sketches) sk.destroy();
      el.classList.remove("drawably-list");
    },
  };
}

function decoration(
  el: HTMLElement,
  cls: string,
  layers: Layer[],
  opts: DrawablyOptions,
  interactive: boolean,
): Sketch {
  const sketch = attachChrome(el, layers, opts, interactive, true);
  el.classList.add(cls);
  return {
    resketch: sketch.resketch,
    destroy() {
      sketch.destroy();
      el.classList.remove(cls);
    },
  };
}

// underline sits just under the text box; circle overshoots it the way a hand
// loops around a word rather than tracing its edges (tuned on 16–48px Inter)
const UNDERLINE_GAP = 2;
const CIRCLE_PAD_X = 1.15;
const CIRCLE_PAD_Y = 1.4;
const CIRCLE_PAD = 4;

export function drawablyUnderline(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return decoration(
    el,
    "drawably-underline",
    [{ className: "drawably-outline", gen: (w, h, o) => roughLine(0, h + UNDERLINE_GAP, w, h + UNDERLINE_GAP, o) }],
    opts,
    true,
  );
}

export function drawablyHighlight(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return decoration(
    el,
    "drawably-highlight",
    [{ className: "drawably-wash", gen: (w, h, o) => scribbleFill(0, 0, w, h, o) }],
    opts,
    false,
  );
}

export function drawablyCircle(el: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  return decoration(
    el,
    "drawably-circle",
    [
      {
        className: "drawably-outline",
        gen: (w, h, o) =>
          roughEllipse(w / 2, h / 2, (w / 2) * CIRCLE_PAD_X + CIRCLE_PAD, (h / 2) * CIRCLE_PAD_Y + CIRCLE_PAD, o),
      },
    ],
    opts,
    true,
  );
}

// breathing room between an anchor's box edge and the arrow's end
const ARROW_GAP = 6;

// ponytail: the overlay lives on <body> in document coordinates, so anchors
// inside a scrolling container drift on scroll — re-parent to the nearest
// common ancestor if that ever matters
export function drawablyArrow(from: HTMLElement, to: HTMLElement, opts: DrawablyOptions = {}): Sketch {
  if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement))
    throw new Error("drawably: arrow needs two anchor elements");

  const svg = createSvg();
  svg.classList.add("drawably-arrow");
  applyTheme(svg, opts);
  document.body.append(svg);

  const roughness = opts.roughness ?? 1;
  const boil = opts.boil ?? 0.3;
  let seed = opts.seed ?? randomSeed();

  function draw() {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    const w = Math.max(a.right, b.right) - left;
    const h = Math.max(a.bottom, b.bottom) - top;
    svg.style.left = `${left + scrollX}px`;
    svg.style.top = `${top + scrollY}px`;
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;

    const ax = a.left - left + a.width / 2;
    const ay = a.top - top + a.height / 2;
    const bx = b.left - left + b.width / 2;
    const by = b.top - top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // distance along the centre line from a box's centre to its edge; `|| 0`
    // turns the 0/0 of a zero-size box into "no inset"
    const exit = (r: DOMRect) => Math.min(r.width / 2 / Math.abs(ux) || 0, r.height / 2 / Math.abs(uy) || 0);
    const t0 = Math.min(exit(a) + ARROW_GAP, len / 2);
    const t1 = Math.min(exit(b) + ARROW_GAP, len / 2);
    const x1 = ax + ux * t0;
    const y1 = ay + uy * t0;
    const x2 = bx - ux * t1;
    const y2 = by - uy * t1;
    paint(
      svg,
      [{ className: "drawably-outline", gen: (_w, _h, o) => roughArrow(x1, y1, x2, y2, o) }],
      [{ x: 0, y: 0, w, h }],
      { seed, roughness, boil },
    );
  }
  draw();

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw()) : null;
  ro?.observe(from);
  ro?.observe(to);
  addEventListener("resize", draw);

  return {
    resketch(s?: number) {
      seed = s ?? randomSeed();
      draw();
    },
    destroy() {
      ro?.disconnect();
      removeEventListener("resize", draw);
      svg.remove();
    },
  };
}
