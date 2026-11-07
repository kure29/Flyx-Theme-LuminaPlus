import { describe, expect, it } from "vitest";
import { buildHomepagePingDisplayLines, shouldRenderHomepagePingBars } from "@/hooks/useNodeCardModel";
import type { HomepagePingLine } from "@/types/models";

const NOW = Date.UTC(2026, 6, 17, 11, 2);

const realLine: HomepagePingLine = {
  taskId: 7,
  taskName: "上海电信",
  client: "node-a",
  isAssigned: true,
  loadState: "ready",
  lastValue: 85,
  samples: [{ time: NOW, value: 85 }],
  max: 85,
  loss: 0,
  route: "CN2 GIA",
};

describe("homepage ping bar visibility", () => {
  it("only draws bars for nodes that have latency data", () => {
    expect(shouldRenderHomepagePingBars(false, false)).toBe(false);
    expect(shouldRenderHomepagePingBars(false, true)).toBe(true);
  });
});

describe("multi-line ping", () => {
  it("never invents a line for a node without test points", () => {
    expect(buildHomepagePingDisplayLines("node-a", [], [], {}, 24, NOW)).toEqual([]);
  });

  it("keeps real lines with their route and honours per-node filters", () => {
    const shown = buildHomepagePingDisplayLines("node-a", [realLine], [], {}, 24, NOW);
    expect(shown).toMatchObject([{ taskId: 7, lastValue: 85, route: "CN2 GIA" }]);
    expect(shown[0]?.buckets).toHaveLength(24);

    expect(buildHomepagePingDisplayLines("node-a", [realLine], [], { "node-a": [8] }, 24, NOW)).toEqual([]);
  });

  it("hides a line that is still loading without any value", () => {
    const pending = { ...realLine, loadState: "pending" as const, lastValue: null, loss: null };
    expect(buildHomepagePingDisplayLines("node-a", [pending], [], {}, 24, NOW)).toEqual([]);
  });
});
