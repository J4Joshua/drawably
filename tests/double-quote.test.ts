import { afterEach, expect, it, vi } from "vitest";
import { drawablyDoubleQuote, type DrawablyDoubleQuoteOptions } from "../src/controls.js";

const cleanup: (() => void)[] = [];
function mount(opts: DrawablyDoubleQuoteOptions = {}) {
  const host = document.createElement("span"); document.body.append(host);
  const sketch = drawablyDoubleQuote(host, { seed: 42, ...opts });
  cleanup.push(() => { sketch.destroy(); host.remove(); });
  return { host, sketch };
}
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); });

it("rejects missing hosts and invalid directions before adding markup", () => {
  expect(() => drawablyDoubleQuote(null as unknown as HTMLElement)).toThrow();
  const host = document.createElement("span");
  expect(() => drawablyDoubleQuote(host, { direction: "bad" as "open" })).toThrow();
  expect(host.innerHTML).toBe("");
});
it("renders decorative opening and closing pairs with seeded geometry", () => {
  const a = mount(), b = mount(), closing = mount({ direction: "close" });
  expect(a.host.innerHTML).toBe(b.host.innerHTML);
  expect(a.host.querySelector(".drawably-double-quote--open")?.getAttribute("aria-hidden")).toBe("true");
  expect(closing.host.querySelector(".drawably-double-quote--close")).not.toBeNull();
  expect(a.host.querySelectorAll(".drawably-double-quote-ink")).toHaveLength(3);
  expect(a.host.querySelector(".drawably-double-quote-ink")?.getAttribute("d")?.match(/M/g)).toHaveLength(4);
  const d = a.host.querySelector("path")?.getAttribute("d");
  a.sketch.resketch(7); expect(a.host.querySelector("path")?.getAttribute("d")).not.toBe(d);
  a.sketch.resketch(42); expect(a.host.querySelector("path")?.getAttribute("d")).toBe(d);
});
it("supports static strokes and custom-property themes", () => {
  const { host } = mount({ boil: 0, stroke: "red", width: 1 });
  expect(host.querySelectorAll("path")).toHaveLength(2);
  expect(host.querySelector(".drawably-boil")).toBeNull();
  expect(host.querySelector<HTMLElement>(".drawably-double-quote")?.style.getPropertyValue("--drawably-stroke")).toBe("red");
});
it("cleans up its observer and preserves existing content", () => {
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect = disconnect; });
  const { host, sketch } = mount();
  const text = document.createTextNode("Quote content"); host.prepend(text);
  sketch.destroy(); sketch.destroy(); sketch.resketch();
  expect(host.innerHTML).toBe("Quote content"); expect(disconnect).toHaveBeenCalledTimes(1);
});
