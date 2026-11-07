import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  flyxNodeToInfo,
  flyxNodeToRealtime,
  getPublic,
  normalizePingHistory,
  rangeForHours,
  type FlyxNode,
} from "@/services/api";
import { splitFlagName } from "@/utils/geo";
import { resolveThemeConfig } from "@/utils/themeConfig";

const GiB = 1024 ** 3;

const node: FlyxNode = {
  id: 3,
  name: "🇭🇰 香港 01",
  online: true,
  cpu: 12.5,
  mem: 50,
  disk: 25,
  load: [0.5, 0.4, 0.3],
  speedUp: 100,
  speedDown: 200,
  uptime: 3600,
  tcp: 10,
  udp: 2,
  cores: 4,
  memUsed: 4 * GiB,
  memTotal: 8 * GiB,
  diskUsed: 10 * GiB,
  diskTotal: 40 * GiB,
  monthUp: 1000,
  monthDown: 2000,
  expiry: "2026-12-01",
  procs: 99,
  os: "Debian GNU/Linux 12 (bookworm)",
  arch: "x86_64",
  virtualization: "kvm",
  cpuName: "AMD EPYC",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FLYX node mapping", () => {
  it("takes the region from the leading flag and drops it from the name", () => {
    expect(splitFlagName("🇭🇰 香港 01")).toEqual({ region: "HK", name: "香港 01" });
    expect(splitFlagName("🇬🇧London")).toEqual({ region: "GB", name: "London" });
    expect(splitFlagName("家里的 NAS")).toEqual({ region: "", name: "家里的 NAS" });
    expect(splitFlagName("NAS 🇯🇵")).toEqual({ region: "", name: "NAS 🇯🇵" });
  });

  it("maps static fields and leaves data FLYX does not have empty", () => {
    expect(flyxNodeToInfo(node)).toMatchObject({
      uuid: "3",
      name: "香港 01",
      region: "HK",
      cpu_name: "AMD EPYC",
      cpu_cores: 4,
      os: "Debian GNU/Linux 12 (bookworm)",
      mem_total: 8 * GiB,
      disk_total: 40 * GiB,
      expired_at: "2026-12-01",
      price: 0,
      traffic_limit: 0,
      tags: "",
      group: "",
    });
  });

  it("maps live figures without swapping directions", () => {
    expect(flyxNodeToRealtime(node, 1234)).toMatchObject({
      online: true,
      cpu: { usage: 12.5 },
      ram: { total: 8 * GiB, used: 4 * GiB },
      disk: { total: 40 * GiB, used: 10 * GiB },
      load: { load1: 0.5, load5: 0.4, load15: 0.3 },
      network: { up: 100, down: 200, totalUp: 1000, totalDown: 2000 },
      connections: { tcp: 10, udp: 2 },
      process: 99,
      updated_at: 1234,
    });
  });

  it("falls back to percentages when an old agent reports no capacity", () => {
    const rt = flyxNodeToRealtime({ id: 1, name: "x", online: true, cpu: 5, mem: 40 }, 0);
    expect(rt.ram).toEqual({ total: 100, used: 40 });
  });

  it("keeps monthly traffic for an offline node", () => {
    expect(flyxNodeToRealtime({ ...node, online: false }, 0)).toMatchObject({
      online: false,
      network: { up: 0, down: 0, totalUp: 1000, totalDown: 2000 },
    });
  });
});

describe("FLYX history", () => {
  it("picks the smallest range that covers the requested hours", () => {
    expect([0, 1, 4, 6, 24, 168, 720].map(rangeForHours)).toEqual([
      "1h", "1h", "6h", "6h", "24h", "7d", "7d",
    ]);
  });

  it("turns named test points into stable tasks with timeouts, loss and routes", () => {
    const result = normalizePingHistory(
      "1",
      {
        range: "1h",
        bucketSec: 10,
        points: [
          { name: "上海电信-测试", samples: [{ t: 1000, ms: 30, loss: 0 }, { t: 2000, ms: null, loss: 100 }] },
          { name: "北京联通-测试", samples: [] },
        ],
      },
      { "上海电信-测试": "CN2 GIA" },
    );
    expect(result.tasks.map((task) => [task.name, task.route, task.loss])).toEqual([
      ["上海电信-测试", "CN2 GIA", 50],
      ["北京联通-测试", "", 0],
    ]);
    expect(result.records.map((record) => record.value)).toEqual([30, -1]);
    expect(result.intervalSeconds).toBe(10);
    // 同一名称在另一台服务器上是同一个任务。
    const other = normalizePingHistory("2", { range: "1h", bucketSec: 10, points: [{ name: "北京联通-测试", samples: [] }] });
    expect(other.tasks[0]?.id).toBe(result.tasks[1]?.id);
  });
});

describe("theme settings", () => {
  it("fills defaults from theme.json and rejects invalid saved values", () => {
    const resolved = resolveThemeConfig({
      desktopNodeViewMode: "list",
      surfaceOpacity: 500,
      showRegionBar: "no",
      custom: 1,
    });
    expect(resolved.desktopNodeViewMode).toBe("list");
    expect(resolved.surfaceOpacity).toBe(100);
    expect(resolved.showRegionBar).toBe(true);
    expect(resolved.enableAdminButton).toBe(false);
    expect(resolved.custom).toBe(1);
  });
});

function respond(byPath: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://panel.test").pathname;
      return new Response(JSON.stringify(byPath[path] ?? { code: 404, msg: "missing" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("public config", () => {
  it("reports a disabled status page by its code", async () => {
    respond({ "/api/v1/public/status": { code: 404, msg: "状态页未开启" } });
    const error = await getPublic().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(404);
  });
});
