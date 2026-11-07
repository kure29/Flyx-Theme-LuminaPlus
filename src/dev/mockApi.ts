/**
 * 开发预览用的 FLYX 公开接口模拟（/status/?mock=1），不会打进正式包。
 * 数据结构照 FLYX 的 doc/guide/status-theme-dev.md；加 `&traffic=0` 模拟管理员关闭「显示网速和流量」，
 * `&disabled=1` 模拟状态页未开启，`&config=<JSON>` 覆盖主题设置。
 */

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

interface MockNode {
  name: string;
  online: boolean;
  cores: number;
  memTotal: number;
  diskTotal: number;
  swapTotal: number;
  os?: string;
  arch?: string;
  virtualization?: string;
  cpuName?: string;
  expiry?: string;
  base: number;
  points: Array<{ name: string; base: number; route?: string; routeV6?: string }>;
}

const NODES: MockNode[] = [
  {
    name: "🇭🇰 香港 HKT 01",
    online: true,
    cores: 4,
    memTotal: 8 * GiB,
    diskTotal: 80 * GiB,
    swapTotal: 2 * GiB,
    os: "Debian GNU/Linux 12 (bookworm)",
    arch: "x86_64",
    virtualization: "kvm",
    cpuName: "AMD EPYC 7B13",
    expiry: "2026-12-20",
    base: 0.35,
    points: [
      { name: "上海电信", base: 32, route: "CN2 GIA" },
      { name: "北京联通", base: 41, route: "4837" },
      { name: "广州移动", base: 18, route: "CMIN2" },
    ],
  },
  {
    name: "🇯🇵 东京 IIJ",
    online: true,
    cores: 2,
    memTotal: 4 * GiB,
    diskTotal: 40 * GiB,
    swapTotal: 0,
    os: "Ubuntu 24.04.1 LTS",
    arch: "x86_64",
    virtualization: "kvm",
    cpuName: "Intel Xeon Platinum 8272CL",
    base: 0.22,
    points: [
      { name: "上海电信", base: 68, route: "163", routeV6: "CN2 GT" },
      { name: "北京联通", base: 79, route: "9929" },
    ],
  },
  {
    name: "🇺🇸 洛杉矶 CN2",
    online: true,
    cores: 8,
    memTotal: 16 * GiB,
    diskTotal: 200 * GiB,
    swapTotal: 4 * GiB,
    os: "AlmaLinux 9.4",
    arch: "x86_64",
    virtualization: "kvm",
    cpuName: "AMD EPYC 9654",
    expiry: "2027-03-01",
    base: 0.6,
    points: [
      { name: "上海电信", base: 138, route: "CN2 GIA" },
      { name: "北京联通", base: 156 },
      { name: "广州移动", base: 171, route: "CMI" },
    ],
  },
  {
    name: "🇸🇬 新加坡 ARM",
    online: true,
    cores: 4,
    memTotal: 24 * GiB,
    diskTotal: 100 * GiB,
    swapTotal: 0,
    os: "Ubuntu 22.04.4 LTS",
    arch: "aarch64",
    virtualization: "kvm",
    cpuName: "Neoverse-N1",
    base: 0.12,
    points: [{ name: "上海电信", base: 72 }],
  },
  {
    name: "🇩🇪 法兰克福",
    online: false,
    cores: 2,
    memTotal: 2 * GiB,
    diskTotal: 20 * GiB,
    swapTotal: 1 * GiB,
    os: "Alpine Linux v3.20",
    arch: "x86_64",
    virtualization: "lxc",
    base: 0.1,
    points: [],
  },
  {
    name: "家里的 NAS",
    online: true,
    cores: 4,
    memTotal: 16 * GiB,
    diskTotal: 4000 * GiB,
    swapTotal: 0,
    base: 0.18,
    points: [],
  },
];

function wave(seed: number, t: number, period: number) {
  return (Math.sin(t / period + seed) + Math.sin(t / (period * 2.7) + seed * 1.7)) / 4 + 0.5;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function metricsAt(index: number, node: MockNode, t: number) {
  const w = wave(index + 1, t / 1000, 600);
  const cpu = clamp(node.base * 100 * (0.5 + w), 1, 99);
  const mem = clamp(35 + 30 * wave(index + 3, t / 1000, 4000), 5, 95);
  const swap = node.swapTotal > 0 ? clamp(5 + 10 * wave(index + 5, t / 1000, 9000), 0, 100) : 0;
  const disk = clamp(20 + index * 9, 5, 95);
  const netOut = (2 + 30 * w * node.base * 10) * MiB * 0.1;
  const netIn = netOut * (0.6 + 0.5 * wave(index + 7, t / 1000, 300));
  return {
    cpu,
    mem,
    swap,
    disk,
    load: (cpu / 100) * node.cores,
    tcp: Math.round(120 + 400 * w),
    udp: Math.round(10 + 30 * w),
    procs: Math.round(140 + 40 * w),
    netIn,
    netOut,
  };
}

function latencyAt(point: MockNode["points"][number], seed: number, t: number) {
  const jitter = wave(seed, t / 1000, 120) * point.base * 0.25;
  if (Math.sin(t / 997_000 + seed * 3) > 0.985) return null;
  return Math.round((point.base + jitter) * 10) / 10;
}

function buildStatus(showTraffic: boolean) {
  const now = Date.now();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const nodes = NODES.map((node, index) => {
    const id = index + 1;
    const dailyAvail = days.map((_, i) => (i === 21 && index === 2 ? 97.9 : index === 4 && i > 26 ? null : 100));
    const base = {
      id,
      name: node.name,
      online: node.online,
      availability: {
        h24: node.online ? 100 : 0,
        d30: node.online ? 99.93 : 86.1,
        days: dailyAvail,
        down: dailyAvail.map((value) => (value == null ? null : Math.round(((100 - value) / 100) * 1440))),
      },
      cores: node.cores,
      memTotal: node.memTotal,
      diskTotal: node.diskTotal,
      ...(node.swapTotal ? { swapTotal: node.swapTotal } : {}),
      ...(node.os ? { os: node.os } : {}),
      ...(node.arch ? { arch: node.arch } : {}),
      ...(node.virtualization ? { virtualization: node.virtualization } : {}),
      ...(node.cpuName ? { cpuName: node.cpuName } : {}),
      ...(node.expiry ? { expiry: node.expiry } : {}),
    };
    const monthly = showTraffic
      ? { monthUp: (120 + index * 85) * GiB, monthDown: (300 + index * 140) * GiB }
      : {};
    if (!node.online) return { ...base, ...monthly };
    const m = metricsAt(index, node, now);
    return {
      ...base,
      ...monthly,
      cpu: m.cpu,
      mem: m.mem,
      disk: m.disk,
      load: [m.load, m.load * 0.9, m.load * 0.8],
      uptime: 86_400 * (12 + index * 7) + 3600 * index,
      tcp: m.tcp,
      udp: m.udp,
      memUsed: (m.mem / 100) * node.memTotal,
      diskUsed: (m.disk / 100) * node.diskTotal,
      ...(node.swapTotal
        ? { swap: m.swap, swapUsed: (m.swap / 100) * node.swapTotal }
        : {}),
      procs: m.procs,
      ...(showTraffic ? { speedUp: m.netOut, speedDown: m.netIn } : {}),
      ...(node.points.length
        ? {
            ping: node.points.map((point, p) => {
              const samples = Array.from({ length: 20 }, (_, s) => {
                const v = latencyAt(point, index * 10 + p, now - (19 - s) * 180_000);
                return v == null ? -1 : Math.round(v);
              });
              const last = samples[samples.length - 1];
              return {
                name: point.name,
                ms: last >= 0 ? last : null,
                loss: (samples.filter((v) => v < 0).length / samples.length) * 100,
                samples,
                ...(point.route ? { route: point.route } : {}),
                ...(point.routeV6 ? { routeV6: point.routeV6 } : {}),
              };
            }),
          }
        : {}),
    };
  });
  const online = nodes.filter((node) => node.online);
  const sum = (key: "speedUp" | "speedDown" | "monthUp" | "monthDown") =>
    nodes.reduce((total, node) => total + ((node as Record<string, unknown>)[key] as number | undefined ?? 0), 0);
  return {
    title: "FLYX 服务器状态",
    timezone: "UTC+08:00",
    generatedAt: now,
    days,
    showTraffic,
    nodes,
    totals: {
      nodes: nodes.length,
      online: online.length,
      speedUp: sum("speedUp"),
      speedDown: sum("speedDown"),
      monthUp: sum("monthUp"),
      monthDown: sum("monthDown"),
      d30: 98.6,
    },
  };
}

const RANGES: Record<string, { ms: number; bucketSec: number }> = {
  "1h": { ms: 3_600_000, bucketSec: 10 },
  "6h": { ms: 6 * 3_600_000, bucketSec: 60 },
  "24h": { ms: 24 * 3_600_000, bucketSec: 240 },
  "7d": { ms: 7 * 24 * 3_600_000, bucketSec: 1680 },
};

function bucketTimes(range: string) {
  const spec = RANGES[range] ?? RANGES["1h"];
  const step = spec.bucketSec * 1000;
  const end = Math.floor(Date.now() / step) * step;
  const times: number[] = [];
  for (let t = end - spec.ms + step; t <= end; t += step) times.push(t);
  return { spec, times };
}

function metricHistory(index: number, range: string, showTraffic: boolean) {
  const node = NODES[index];
  const { spec, times } = bucketTimes(range);
  return {
    range,
    bucketSec: spec.bucketSec,
    points: times
      // 模拟一段离线：这段时间没有点。
      .filter((t) => Math.floor(t / 3_600_000) % 17 !== 5)
      .map((t) => {
        const m = metricsAt(index, node, t);
        const { netIn, netOut, ...rest } = m;
        return { t, ...rest, ...(showTraffic ? { netIn, netOut } : {}) };
      }),
  };
}

function pingHistory(index: number, range: string) {
  const node = NODES[index];
  const { spec, times } = bucketTimes(range);
  // 每 3 分钟一轮测试；短时间段里大部分没有样本。
  const roundMs = 180_000;
  return {
    range,
    bucketSec: spec.bucketSec,
    points: node.points.map((point, p) => ({
      name: point.name,
      samples: times
        .filter((t) => spec.bucketSec * 1000 >= roundMs || t % roundMs < spec.bucketSec * 1000)
        .map((t) => {
          const ms = latencyAt(point, index * 10 + p, t);
          return { t, ms, loss: ms == null ? 100 : 0 };
        }),
    })),
  };
}

function envelope(data: unknown, code = 0, msg = "") {
  return new Response(JSON.stringify({ code, msg, data, ts: Date.now() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function installDevMockApi() {
  sessionStorage.setItem("flyx-luminaplus:dev-mock", "1");
  const params = new URLSearchParams(window.location.search);
  const showTraffic = params.get("traffic") !== "0";
  const disabled = params.get("disabled") === "1";
  let values: Record<string, unknown> = {};
  try {
    const raw = params.get("config");
    if (raw) values = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // 无效的 config 参数按默认设置处理。
  }
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return nativeFetch(input, init);
    }
    if (disabled) return envelope(null, 404, "状态页未开启");
    if (url.pathname === "/api/v1/public/status") return envelope(buildStatus(showTraffic));
    if (url.pathname === "/api/v1/public/status/theme-config") {
      return envelope({ theme: "luminaplus", values });
    }
    const index = Number(url.searchParams.get("node")) - 1;
    if (!NODES[index]) return envelope(null, 404, "服务器不存在");
    const range = url.searchParams.get("range") ?? "1h";
    if (!RANGES[range]) return envelope(null, 400, "range 参数不对");
    if (url.pathname === "/api/v1/public/status/history") {
      return envelope(metricHistory(index, range, showTraffic));
    }
    if (url.pathname === "/api/v1/public/status/ping-history") {
      return envelope(pingHistory(index, range));
    }
    return envelope(null, 404, `No mock for ${url.pathname}`);
  };
}
