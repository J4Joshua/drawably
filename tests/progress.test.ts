import { afterEach, expect, it, vi } from "vitest";
import { drawablyProgressBar, type DrawablyProgressBarOptions } from "../src/controls.js";

const milestones = [{ label: "Start", value: 0 }, { label: "Draft", value: 25 }, { label: "Review", value: 60 }, { label: "Done", value: 100 }];
const cleanup: (() => void)[] = [];
function mount(opts: DrawablyProgressBarOptions = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const sketch = drawablyProgressBar(host, { seed: 42, value: 45, milestones, ...opts });
  cleanup.push(() => { sketch.destroy(); host.remove(); });
  return { host, sketch };
}
const outline = (host: HTMLElement) => host.querySelector(".drawably-outline")?.getAttribute("d");
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("exposes native progress semantics and all milestone statuses", () => {
  const { host } = mount({ label: "Project progress" });
  const progress = host.querySelector("progress")!;
  expect(progress.value).toBe(45); expect(progress.max).toBe(100);
  expect(progress.getAttribute("aria-label")).toBe("Project progress");
  expect(host.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(host.querySelectorAll('li[data-reached="true"]')).toHaveLength(2);
  expect(host.querySelectorAll(".drawably-progress-check")).toHaveLength(6);
  expect(host.textContent).toContain("60% · Upcoming");
});

it("updates at exact thresholds and when moving backwards without changing the track", () => {
  const { host, sketch } = mount({ boil: 0 }); const original = outline(host);
  sketch.setValue(60);
  expect(host.querySelectorAll('li[data-reached="true"]')).toHaveLength(3);
  expect(host.querySelector("progress")?.value).toBe(60);
  expect(outline(host)).toBe(original);
  sketch.setValue(10);
  expect(host.querySelectorAll('li[data-reached="true"]')).toHaveLength(1);
  expect(outline(host)).toBe(original);
});

it("clamps finite values and respects custom maxima", () => {
  const { host, sketch } = mount({ max: 200, value: 50 });
  expect(host.textContent).toContain("25%");
  sketch.setValue(999); expect(host.querySelector("progress")?.value).toBe(200);
  expect(host.textContent).toContain("100%");
  sketch.setValue(-50); expect(host.querySelector("progress")?.value).toBe(0);
  expect(host.querySelector(".drawably-progress-fill")?.getAttribute("d")).toBe("");
});

it("rejects invalid configuration and updates before modifying the chart", () => {
  expect(() => drawablyProgressBar(null as unknown as HTMLElement)).toThrow();
  for (const opts of [{ max: 0 }, { max: -1 }, { max: Infinity }, { value: NaN }, { boil: -1 }, { milestones: [{ label: "Bad", value: 101 }] }, { milestones: [{ label: "", value: 1 }] }, { milestones: [{ label: "A", value: 10 }, { label: "B", value: 10 }] }]) {
    const el = document.createElement("div");
    expect(() => drawablyProgressBar(el, opts)).toThrow(); expect(el.innerHTML).toBe("");
  }
  const { host, sketch } = mount(); const before = host.innerHTML;
  expect(() => sketch.setValue(Infinity)).toThrow();
  expect(() => sketch.setMilestones([{ label: "Bad", value: -1 }])).toThrow();
  expect(host.innerHTML).toBe(before);
});

it("sorts a copy of milestones and renders labels safely as text", () => {
  const input = [{ label: "<img src=x>", value: 100 }, { label: "Start", value: 0 }];
  const { host, sketch } = mount({ milestones: input });
  expect(input[0].value).toBe(100); expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("li")?.textContent).toContain("Start");
  input[0].label = "Changed"; sketch.resketch(42);
  expect(host.textContent).not.toContain("Changed");
  sketch.setMilestones([]); expect(host.querySelector("ol")?.hidden).toBe(true);
  sketch.setMilestones([{ label: "Halfway", value: 50 }]);
  expect(host.querySelector("ol")?.hidden).toBe(false);
  expect(host.querySelectorAll("li")).toHaveLength(1);
});

it("preserves seeded geometry and emits one frame when boil is off", () => {
  const a = mount({ boil: 0 }), b = mount({ boil: 0 });
  expect(a.host.innerHTML).toBe(b.host.innerHTML);
  expect(a.host.querySelector(".drawably-boil")).toBeNull();
  const original = outline(a.host); a.sketch.resketch(5);
  expect(outline(a.host)).not.toBe(original); a.sketch.resketch(42);
  expect(outline(a.host)).toBe(original);
});

it("lays out colliding labels on separate rows and cleans up resize and font listeners", () => {
  let resize = () => {}; const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(fn: () => void) { resize = fn; } observe() {} disconnect = disconnect; });
  const { host, sketch } = mount();
  const track = host.querySelector(".drawably-progress-track")!;
  Object.defineProperty(track, "clientWidth", { value: 220 }); resize();
  expect(host.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 220 44");
  expect(new Set([...host.querySelectorAll("li")].map(li => li.style.top)).size).toBeGreaterThan(1);
  const keep = document.createElement("p"); keep.textContent = "Keep"; host.append(keep);
  const fonts = document.fonts && vi.spyOn(document.fonts, "removeEventListener");
  sketch.destroy(); sketch.destroy(); resize(); sketch.setValue(99); sketch.setMilestones([]); sketch.resketch();
  expect(host.innerHTML).toBe("<p>Keep</p>"); expect(disconnect).toHaveBeenCalled();
  if (fonts) expect(fonts).toHaveBeenCalledWith("loadingdone", expect.any(Function));
});
