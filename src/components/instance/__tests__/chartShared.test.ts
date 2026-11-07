import { describe, expect, it } from "vitest";
import {
  buildLoadTimeRangeOptions,
  buildPingTimeRangeOptions,
} from "@/components/instance/chartShared";

// 与 FLYX 公开历史接口的范围一致：1h / 6h / 24h / 7d。
const FLYX_RANGES = [
  { label: "1 小时", value: 1 },
  { label: "6 小时", value: 6 },
  { label: "1 天", value: 24 },
  { label: "7 天", value: 168 },
];

describe("detail chart time ranges", () => {
  it("offers the four FLYX history ranges for Ping", () => {
    expect(buildPingTimeRangeOptions(0)).toEqual(FLYX_RANGES);
    expect(buildPingTimeRangeOptions(90 * 24)).toEqual(FLYX_RANGES);
  });

  it("adds a realtime option in front for load", () => {
    expect(buildLoadTimeRangeOptions(0)).toEqual([{ label: "实时", value: 0 }, ...FLYX_RANGES]);
  });
});
