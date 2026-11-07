/**
 * FLYX 公开状态接口适配层（flyxApi 1）。
 *
 * 主题内部沿用原版 LuminaPlus 的数据结构（NodeInfo / NodeRealtime / LoadRecord / PingRecord ...），
 * 这里把 FLYX 的 `/api/v1/public/status`、历史接口和 theme-config 映射过去，组件不需要知道数据来源。
 * 接口说明见 FLYX 仓库 doc/guide/status-theme-dev.md。
 */
import type {
  LoadRecord,
  LoadRecordsResponse,
  NodeInfo,
  PingOverviewItem,
  PingRecord,
  PingRecordsResponse,
  PingTask,
  PingTaskStats,
  PublicConfig,
} from "@/types/models";
import { fetchWithTimeout } from "@/utils/abort";
import { splitFlagName } from "@/utils/geo";
import { regionFromRules, parseRegionMap } from "@/utils/regionMap";
import { resolveThemeConfig } from "@/utils/themeConfig";
import type { TrafficMetricSeries } from "@/utils/trafficStats";

const DEFAULT_API_TIMEOUT_MS = 12_000;
const THEME_SHORT = "luminaplus";
/** 面板每 5 秒最多重新计算一次状态，短时间内的多次读取共用同一份结果。 */
const STATUS_CACHE_MS = 4_000;

const STATUS_PATH = "/api/v1/public/status";
const METRIC_HISTORY_PATH = "/api/v1/public/status/history";
const PING_HISTORY_PATH = "/api/v1/public/status/ping-history";
const THEME_CONFIG_PATH = "/api/v1/public/status/theme-config";

interface ApiCallOptions {
  signal?: AbortSignal;
  timeout?: number;
}

// ---------- FLYX 接口结构 ----------

interface FlyxEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
  ts?: number;
}

export interface FlyxPing {
  name: string;
  ms: number | null;
  loss: number;
  samples: number[];
  route?: string;
  routeV6?: string;
}

export interface FlyxNode {
  id: number;
  name: string;
  online: boolean;
  availability?: {
    h24: number | null;
    d30: number | null;
    days: Array<number | null>;
    down: Array<number | null>;
  };
  cpu?: number;
  mem?: number;
  disk?: number;
  load?: [number, number, number];
  speedUp?: number;
  speedDown?: number;
  uptime?: number;
  tcp?: number;
  udp?: number;
  cores?: number;
  memUsed?: number;
  memTotal?: number;
  diskUsed?: number;
  diskTotal?: number;
  monthUp?: number;
  monthDown?: number;
  expiry?: string;
  /** 国家或地区代码（较新的 FLYX：管理员选的，否则按服务器地址识别）。 */
  region?: string;
  swap?: number;
  swapUsed?: number;
  swapTotal?: number;
  procs?: number;
  os?: string;
  arch?: string;
  virtualization?: string;
  cpuName?: string;
  ping?: FlyxPing[];
}

export interface FlyxStatus {
  title: string;
  timezone: string;
  generatedAt: number;
  days: string[];
  showTraffic: boolean;
  nodes: FlyxNode[];
  totals?: {
    nodes: number;
    online: number;
    speedUp: number;
    speedDown: number;
    monthUp: number;
    monthDown: number;
    d30: number | null;
  };
}

type FlyxRange = "1h" | "6h" | "24h" | "7d";

interface FlyxMetricHistory {
  range: FlyxRange;
  bucketSec: number;
  points: Array<{
    t: number;
    cpu: number;
    mem: number;
    swap: number;
    disk: number;
    load: number;
    tcp: number;
    udp: number;
    procs: number;
    netIn?: number;
    netOut?: number;
  }>;
}

interface FlyxPingHistory {
  range: FlyxRange;
  bucketSec: number;
  points: Array<{
    name: string;
    samples: Array<{ t: number; ms: number | null; loss: number }>;
  }>;
}

interface FlyxThemeConfig {
  theme: string;
  values: Record<string, unknown>;
}

interface PingOverviewResponse {
  records: PingRecord[];
  tasks: PingTask[];
  taskAssignmentsKnown?: boolean;
  /** 请求失败的节点不参与任务分配判断，首页保留它们上次成功的结果。 */
  failedEntityIds?: string[];
  successfulEntityIds?: string[];
  rangeStartMs?: number;
  rangeEndMs?: number;
  intervalSeconds?: number;
  stats?: PingTaskStats[];
  /** 每个节点各自的窗口丢包率(节点 uuid → 任务 id → 百分比)。 */
  clientWindowLoss?: Record<string, Record<number, number>>;
}

// ---------- 错误 ----------

/** `status` 是 HTTP 状态码，或 FLYX 返回体里非 0 的 `code`（例如状态页未开启时为 404）。 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class MetricApiUnavailableError extends Error {
  constructor() {
    super("Metric API is unavailable on this server");
    this.name = "MetricApiUnavailableError";
  }
}

const warned = new Set<string>();
export function warnDegradedOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[LuminaPlus] ${message}`);
}

// ---------- 工具 ----------

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNum(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function requestFlyx<T>(path: string, options?: ApiCallOptions): Promise<T> {
  const response = await fetchWithTimeout(
    path,
    { credentials: "same-origin", headers: { Accept: "application/json" } },
    options?.timeout ?? DEFAULT_API_TIMEOUT_MS,
    options?.signal,
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new ApiRequestError(detail || `Request failed: ${response.status}`, response.status, path);
  }
  const payload = (await response.json()) as FlyxEnvelope<T> | null;
  if (!payload || typeof payload !== "object" || typeof payload.code !== "number") {
    throw new SyntaxError("接口返回的不是 FLYX 的响应格式");
  }
  if (payload.code !== 0) {
    throw new ApiRequestError(payload.msg || `code ${payload.code}`, payload.code, path);
  }
  if (payload.data == null) throw new SyntaxError("接口没有返回数据");
  return payload.data;
}

// ---------- /public/status ----------

let cachedStatus: FlyxStatus | null = null;
let cachedStatusAt = 0;
let statusRequest: Promise<FlyxStatus> | null = null;

function normalizeStatus(raw: FlyxStatus): FlyxStatus {
  return {
    ...raw,
    title: str(raw.title),
    timezone: str(raw.timezone),
    generatedAt: num(raw.generatedAt, Date.now()),
    days: Array.isArray(raw.days) ? raw.days : [],
    showTraffic: raw.showTraffic === true,
    nodes: (Array.isArray(raw.nodes) ? raw.nodes : []).filter(
      (node): node is FlyxNode =>
        Boolean(node) && typeof node === "object" && Number.isInteger(node.id) && node.id > 0,
    ),
  };
}

/** 读取状态；`maxAgeMs` 内的缓存直接复用，同一时刻的多次调用合并成一次请求。 */
export async function loadStatus(options?: ApiCallOptions, maxAgeMs = STATUS_CACHE_MS) {
  if (cachedStatus && Date.now() - cachedStatusAt < maxAgeMs) return cachedStatus;
  if (!statusRequest) {
    // 共享请求不跟随单个调用者取消，避免一个视图卸载让其他视图拿到 AbortError。
    statusRequest = requestFlyx<FlyxStatus>(STATUS_PATH, { timeout: options?.timeout })
      .then((raw) => {
        cachedStatus = normalizeStatus(raw);
        cachedStatusAt = Date.now();
        return cachedStatus;
      })
      .finally(() => {
        statusRequest = null;
      });
  }
  const request = statusRequest;
  const signal = options?.signal;
  if (!signal) return request;
  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  return new Promise<FlyxStatus>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** 最近一次成功读到的状态（同步），没有时为 null。 */
export function peekStatus() {
  return cachedStatus;
}

function findNode(status: FlyxStatus | null, uuid: string) {
  const id = Number(uuid);
  return status?.nodes.find((node) => node.id === id);
}

function formatRoute(ping: Pick<FlyxPing, "route" | "routeV6"> | undefined) {
  const v4 = str(ping?.route).trim();
  const v6 = str(ping?.routeV6).trim();
  if (v4 && v6) return `${v4} / v6 ${v6}`;
  return v4 || (v6 ? `v6 ${v6}` : "");
}

/** 节点各测试点的回程线路（测试点名称 → 线路名），没检测过的测试点不出现。 */
export function getNodeRoutes(uuid: string): Record<string, string> {
  const node = findNode(cachedStatus, uuid);
  const routes: Record<string, string> = {};
  for (const ping of node?.ping ?? []) {
    const route = formatRoute(ping);
    if (ping?.name && route) routes[ping.name] = route;
  }
  return routes;
}

export function flyxNodeToInfo(node: FlyxNode): NodeInfo {
  const { region, name } = splitFlagName(str(node.name), str(node.region));
  return {
    uuid: String(node.id),
    name: name || str(node.name) || `#${node.id}`,
    group: "",
    region,
    hidden: false,
    cpu_name: str(node.cpuName),
    cpu_cores: num(node.cores),
    arch: str(node.arch),
    virtualization: str(node.virtualization),
    os: str(node.os),
    kernel_version: "",
    gpu_name: "",
    mem_total: num(node.memTotal),
    swap_total: num(node.swapTotal),
    disk_total: num(node.diskTotal),
    weight: node.id,
    price: 0,
    billing_cycle: "",
    auto_renewal: false,
    currency: "",
    expired_at: str(node.expiry),
    tags: "",
    public_remark: "",
    traffic_limit: 0,
    traffic_limit_type: "",
    ipv4: "",
    ipv6: "",
    created_at: "",
    updated_at: "",
  };
}

/** 有使用率但没有容量时（旧 agent），把容量当作 100，已用量就是百分比。 */
function usage(used: unknown, total: unknown, pct: unknown) {
  const t = num(total);
  const u = optionalNum(used);
  if (t > 0) return { total: t, used: u ?? (num(pct) / 100) * t };
  if (optionalNum(pct) != null) return { total: 100, used: num(pct) };
  return { total: 0, used: 0 };
}

export function flyxNodeToRealtime(node: FlyxNode, generatedAt: number): Record<string, unknown> {
  const totalUp = num(node.monthUp);
  const totalDown = num(node.monthDown);
  const hasLive = node.online && optionalNum(node.cpu) != null;
  if (!hasLive) {
    return {
      online: node.online === true,
      network: { up: 0, down: 0, totalUp, totalDown },
      ram: { total: num(node.memTotal), used: 0 },
      swap: { total: num(node.swapTotal), used: 0 },
      disk: { total: num(node.diskTotal), used: 0 },
    };
  }
  const load = Array.isArray(node.load) ? node.load : [];
  return {
    online: true,
    cpu: { usage: num(node.cpu) },
    ram: usage(node.memUsed, node.memTotal, node.mem),
    swap: usage(node.swapUsed, node.swapTotal, node.swap),
    load: { load1: num(load[0]), load5: num(load[1]), load15: num(load[2]) },
    disk: usage(node.diskUsed, node.diskTotal, node.disk),
    network: { up: num(node.speedUp), down: num(node.speedDown), totalUp, totalDown },
    connections: { tcp: num(node.tcp), udp: num(node.udp) },
    uptime: num(node.uptime),
    process: num(node.procs),
    updated_at: generatedAt,
  };
}

// ---------- 站点信息与主题设置 ----------

const THEME_SETTINGS_CACHE_MS = 60_000;
let cachedThemeSettings: { values: Record<string, unknown>; at: number } | null = null;

export async function loadThemeSettings(options?: ApiCallOptions): Promise<Record<string, unknown>> {
  const config = await requestFlyx<FlyxThemeConfig>(THEME_CONFIG_PATH, options);
  const values = config?.values;
  const resolved =
    !values || typeof values !== "object" || Array.isArray(values) ? {} : values;
  cachedThemeSettings = { values: resolved, at: Date.now() };
  return resolved;
}

/** 节点列表要用到「服务器地区」设置；一分钟内复用上次读到的设置，读不到时当作没设置。 */
async function themeSettingsForNodes(options?: ApiCallOptions) {
  if (cachedThemeSettings && Date.now() - cachedThemeSettings.at < THEME_SETTINGS_CACHE_MS) {
    return cachedThemeSettings.values;
  }
  try {
    return await loadThemeSettings(options);
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    return cachedThemeSettings?.values ?? {};
  }
}

function describeThemeSettingsReadError(error: unknown) {
  if (error instanceof ApiRequestError) return `主题设置读取失败（${error.status}）`;
  if (error instanceof SyntaxError) return "主题设置接口返回了无效数据";
  return "主题设置暂时无法读取";
}

export async function getPublic(options?: ApiCallOptions): Promise<PublicConfig> {
  const status = await loadStatus(options);
  let themeSettings = resolveThemeConfig({});
  let themeSettingsError: string | undefined;
  try {
    themeSettings = resolveThemeConfig(await loadThemeSettings(options));
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    // 读不到设置时用默认值显示，不影响状态页本身。
    themeSettingsError = describeThemeSettingsReadError(error);
  }
  return {
    sitename: status.title || "FLYX",
    description: "服务器运行状态",
    theme: THEME_SHORT,
    allow_cors: false,
    disable_password_login: false,
    oauth_enable: false,
    private_site: false,
    record_enabled: true,
    record_preserve_time: 0,
    ping_record_preserve_time: 0,
    // 面板不公开保留天数；超出保留期的范围只会返回已有的数据。
    metric_retention_days: 0,
    custom_head: "",
    custom_body: "",
    theme_settings: themeSettings,
    theme_settings_error: themeSettingsError,
    show_traffic: status.showTraffic,
    timezone: status.timezone,
  };
}

// ---------- 节点与实时状态 ----------

export async function getNodes(options?: ApiCallOptions): Promise<NodeInfo[]> {
  const [status, settings] = await Promise.all([loadStatus(options), themeSettingsForNodes(options)]);
  const rules = parseRegionMap(settings.regionMap);
  return status.nodes.map((node) => {
    const info = flyxNodeToInfo(node);
    // 主题设置里写了的地区优先于从名称推断的。
    const region = regionFromRules([str(node.name), info.name], rules);
    return region ? { ...info, region } : info;
  });
}

export async function getNodesLatestStatus(
  uuids?: string[],
  options?: ApiCallOptions,
): Promise<Record<string, unknown>> {
  const status = await loadStatus(options);
  const selected = uuids?.length ? new Set(uuids) : null;
  return Object.fromEntries(
    status.nodes
      .filter((node) => !selected || selected.has(String(node.id)))
      .map((node) => [String(node.id), flyxNodeToRealtime(node, status.generatedAt)]),
  );
}

// ---------- 历史 ----------

function parseNodeId(uuid: string) {
  const id = Number(uuid);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid node id: ${uuid}`);
  return id;
}

/** 主题的小时数 → FLYX 支持的范围（1h / 6h / 24h / 7d），取能覆盖的最小一档。 */
export function rangeForHours(hours: number): FlyxRange {
  if (hours <= 1) return "1h";
  if (hours <= 6) return "6h";
  if (hours <= 24) return "24h";
  return "7d";
}

const RANGE_HOURS: Record<FlyxRange, number> = { "1h": 1, "6h": 6, "24h": 24, "7d": 168 };

/**
 * 同一节点、同一范围、同一接口的请求合并成一次；每位调用者独立取消，
 * 所有调用者都取消后才中止网络请求。
 */
interface SharedRequest<T> {
  promise: Promise<T>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
}

const sharedRequests = new Map<string, SharedRequest<unknown>>();

function sharedRequest<T>(key: string, path: string, options?: ApiCallOptions): Promise<T> {
  const signal = options?.signal;
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  let shared = sharedRequests.get(key) as SharedRequest<T> | undefined;
  if (!shared) {
    const controller = new AbortController();
    const created: SharedRequest<T> = {
      promise: requestFlyx<T>(path, { timeout: options?.timeout, signal: controller.signal }),
      controller,
      consumers: 0,
      settled: false,
    };
    const clear = () => {
      created.settled = true;
      if (sharedRequests.get(key) === created) sharedRequests.delete(key);
    };
    void created.promise.then(clear, clear);
    sharedRequests.set(key, created as SharedRequest<unknown>);
    shared = created;
  }
  const request = shared;
  return new Promise<T>((resolve, reject) => {
    request.consumers += 1;
    let done = false;
    const finish = () => {
      if (done) return false;
      done = true;
      signal?.removeEventListener("abort", onAbort);
      request.consumers -= 1;
      return true;
    };
    const onAbort = () => {
      if (!finish()) return;
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      if (request.consumers === 0 && !request.settled) {
        if (sharedRequests.get(key) === request) sharedRequests.delete(key);
        request.controller.abort();
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    request.promise.then(
      (value) => {
        if (finish()) resolve(value);
      },
      (error) => {
        if (finish()) reject(error);
      },
    );
  });
}

function getMetricHistory(uuid: string, range: FlyxRange, options?: ApiCallOptions) {
  const params = new URLSearchParams({ node: String(parseNodeId(uuid)), range });
  return sharedRequest<FlyxMetricHistory>(
    `metric\u0000${uuid}\u0000${range}`,
    `${METRIC_HISTORY_PATH}?${params}`,
    options,
  );
}

function getPingHistory(uuid: string, range: FlyxRange, options?: ApiCallOptions) {
  const params = new URLSearchParams({ node: String(parseNodeId(uuid)), range });
  return sharedRequest<FlyxPingHistory>(
    `ping\u0000${uuid}\u0000${range}`,
    `${PING_HISTORY_PATH}?${params}`,
    options,
  );
}

function rangeMeta(range: FlyxRange) {
  const end = Date.now();
  return { rangeStartMs: end - RANGE_HOURS[range] * 3_600_000, rangeEndMs: end };
}

function positiveBucket(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function historyPoints(payload: FlyxMetricHistory | null | undefined) {
  return (Array.isArray(payload?.points) ? payload.points : []).filter(
    (point) => point && typeof point.t === "number" && Number.isFinite(point.t),
  );
}

export async function getLoadRecords(
  uuid: string,
  hours = 6,
  options?: ApiCallOptions,
): Promise<LoadRecordsResponse> {
  const range = rangeForHours(hours);
  const payload = await getMetricHistory(uuid, range, options);
  const points = historyPoints(payload);
  // 历史只给使用率；按当前容量换算成字节，图表和标签就能沿用原来的计算。
  const live = findNode(peekStatus() ?? (await loadStatus(options).catch(() => null)), uuid);
  const memTotal = num(live?.memTotal) || 100;
  const swapTotal = num(live?.swapTotal) || 100;
  const diskTotal = num(live?.diskTotal) || 100;
  const hasSwap = num(live?.swapTotal) > 0 || points.some((point) => num(point.swap) > 0);
  const capabilities = {
    swap: hasSwap,
    trafficTotals: false,
    connections: true,
    process: points.some((point) => num(point.procs) > 0),
    load: true,
  };
  const records: LoadRecord[] = points.map((point) => ({
    cpu: num(point.cpu),
    gpu: 0,
    ram: (num(point.mem) / 100) * memTotal,
    ram_total: memTotal,
    swap: (num(point.swap) / 100) * swapTotal,
    swap_total: swapTotal,
    load: num(point.load),
    temp: 0,
    disk: (num(point.disk) / 100) * diskTotal,
    disk_total: diskTotal,
    net_in: num(point.netIn),
    net_out: num(point.netOut),
    net_total_up: 0,
    net_total_down: 0,
    process: num(point.procs),
    connections: num(point.tcp),
    connections_udp: num(point.udp),
    time: point.t,
    client: uuid,
    history_capabilities: capabilities,
  }));
  return {
    count: records.length,
    records,
    ...rangeMeta(range),
    intervalSeconds: positiveBucket(payload?.bucketSec),
  };
}

export interface TodayTrafficMetricResponse {
  series: TrafficMetricSeries[];
  rangeStartMs: number;
  rangeEndMs: number;
  intervalSeconds?: number;
}

async function mapBatches<T, R>(
  items: T[],
  size: number,
  mapper: (item: T) => Promise<R>,
  signal?: AbortSignal,
) {
  const output: PromiseSettledResult<R>[] = [];
  for (let index = 0; index < items.length; index += size) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    output.push(...(await Promise.allSettled(items.slice(index, index + size).map(mapper))));
  }
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  return output;
}

/**
 * 今日流量：FLYX 没有按天的流量计数，用 24 小时网速历史按时间段积分得到（平均网速 × 时长），
 * 峰值取各时间段的平均网速。管理员关闭「显示网速和流量」时没有数据。
 */
export async function getTodayTrafficMetrics(
  entityIds: string[],
  startMs: number,
  endMs: number,
  options?: ApiCallOptions,
): Promise<TodayTrafficMetricResponse> {
  const empty = { series: [], rangeStartMs: startMs, rangeEndMs: endMs };
  if (entityIds.length === 0) return empty;
  const status = await loadStatus(options);
  if (!status.showTraffic) return empty;
  const histories = await mapBatches(
    entityIds,
    4,
    (uuid) => getMetricHistory(uuid, "24h", options),
    options?.signal,
  );
  const series: TrafficMetricSeries[] = [];
  let intervalSeconds = 0;

  entityIds.forEach((uuid, index) => {
    const result = histories[index];
    if (result?.status !== "fulfilled") return;
    const bucketSec = positiveBucket(result.value.bucketSec) ?? 240;
    intervalSeconds = Math.max(intervalSeconds, bucketSec);
    const points = historyPoints(result.value).filter(
      (point) => point.t >= startMs && point.t <= endMs && point.netIn != null,
    );
    const seconds = (point: { t: number }) =>
      Math.max(0, Math.min(bucketSec, (endMs - point.t) / 1_000));
    const at = (t: number) => new Date(t).toISOString();
    series.push(
      {
        metricKey: "traffic.up",
        client: uuid,
        points: points.map((p) => ({ time: at(p.t), value: num(p.netOut) * seconds(p), count: 1 })),
      },
      {
        metricKey: "traffic.down",
        client: uuid,
        points: points.map((p) => ({ time: at(p.t), value: num(p.netIn) * seconds(p), count: 1 })),
      },
      {
        metricKey: "net.out.rate",
        client: uuid,
        intervalSeconds: bucketSec,
        points: points.map((p) => ({ time: at(p.t), value: num(p.netOut), count: 1 })),
      },
      {
        metricKey: "net.in.rate",
        client: uuid,
        intervalSeconds: bucketSec,
        points: points.map((p) => ({ time: at(p.t), value: num(p.netIn), count: 1 })),
      },
    );
  });

  return { series, rangeStartMs: startMs, rangeEndMs: endMs, intervalSeconds: intervalSeconds || undefined };
}

// ---------- 延迟 ----------

/**
 * FLYX 的测试点只有名称；主题内部按任务 id 区分线路，这里给每个名称分配一个稳定的 id
 * （同一名称在所有节点上是同一个 id，页面打开期间不变）。
 */
const taskIdsByName = new Map<string, number>();

function taskIdForName(name: string) {
  let id = taskIdsByName.get(name);
  if (id == null) {
    id = taskIdsByName.size + 1;
    taskIdsByName.set(name, id);
  }
  return id;
}

function taskFor(name: string, clients: string[], intervalSeconds: number, loss: number, route: string): PingTask {
  const id = taskIdForName(name);
  return {
    id,
    interval: intervalSeconds,
    name,
    loss,
    clients,
    type: "icmp",
    target: "",
    weight: id,
    route,
  };
}

export function normalizePingHistory(
  uuid: string,
  payload: FlyxPingHistory | null | undefined,
  routes: Record<string, string> = {},
): PingRecordsResponse {
  const range = payload?.range && payload.range in RANGE_HOURS ? payload.range : "1h";
  const bucketSec = positiveBucket(payload?.bucketSec);
  const series = (Array.isArray(payload?.points) ? payload.points : []).filter(
    (point) => point && typeof point.name === "string" && point.name !== "",
  );
  const records: PingRecord[] = [];
  const tasks: PingTask[] = [];
  const windowLoss: Record<number, number> = {};
  for (const point of series) {
    const id = taskIdForName(point.name);
    const samples = (Array.isArray(point.samples) ? point.samples : []).filter(
      (sample) => sample && typeof sample.t === "number" && Number.isFinite(sample.t),
    );
    let lossSum = 0;
    for (const sample of samples) {
      const loss = Math.min(100, Math.max(0, num(sample.loss, sample.ms == null ? 100 : 0)));
      lossSum += loss;
      records.push({
        task_id: id,
        time: sample.t,
        value: sample.ms == null ? -1 : num(sample.ms),
        client: uuid,
        count: 1,
        loss,
      });
    }
    // 每个时间段的轮数相近，各段丢包率的平均就是整个窗口的丢包率。
    const loss = samples.length > 0 ? lossSum / samples.length : 0;
    windowLoss[id] = loss;
    tasks.push(taskFor(point.name, [uuid], bucketSec ?? 60, loss, routes[point.name] ?? ""));
  }
  return {
    count: records.length,
    records,
    tasks,
    windowLoss,
    ...rangeMeta(range),
    intervalSeconds: bucketSec,
  };
}

export async function getPingRecords(
  uuid: string,
  hours = 6,
  options?: ApiCallOptions,
): Promise<PingRecordsResponse> {
  const payload = await getPingHistory(uuid, rangeForHours(hours), options);
  return normalizePingHistory(uuid, payload, getNodeRoutes(uuid));
}

/**
 * 合并各节点的任务顺序：每台节点的顺序都是固定测试点在前的子序列，
 * 新任务插在它在该节点中前一个已知任务之后，没有前驱时插在最前。
 */
function mergeTaskOrder(target: number[], next: number[]) {
  let anchor = -1;
  for (const id of next) {
    const existing = target.indexOf(id);
    if (existing >= 0) {
      anchor = existing;
      continue;
    }
    target.splice(anchor + 1, 0, id);
    anchor += 1;
  }
}

export function prewarmPingOverviewDependencies() {
  void loadStatus().catch(() => undefined);
}

export async function getPingOverview(
  hours = 1,
  taskId?: number,
  options?: { signal?: AbortSignal; entityIds?: string[]; includeStats?: boolean },
): Promise<PingOverviewResponse> {
  const status = await loadStatus({ signal: options?.signal });
  const entityIds = options?.entityIds?.length
    ? options.entityIds
    : status.nodes.map((node) => String(node.id));
  // 没有延迟数据的节点不必再请求历史。
  const withPing = new Set(
    status.nodes.filter((node) => (node.ping?.length ?? 0) > 0).map((node) => String(node.id)),
  );
  const requested = entityIds.filter((uuid) => withPing.has(uuid));
  const responses = await mapBatches(
    requested,
    4,
    (uuid) => getPingRecords(uuid, hours, { signal: options?.signal }),
    options?.signal,
  );
  const failedEntityIds = requested.filter((_, index) => responses[index]?.status === "rejected");
  const successfulEntityIds = entityIds.filter((uuid) => !failedEntityIds.includes(uuid));
  const records: PingRecord[] = [];
  const tasks = new Map<number, PingTask>();
  const taskOrder: number[] = [];
  const clientWindowLoss: Record<string, Record<number, number>> = {};
  let intervalSeconds = 0;
  responses.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const client = requested[index];
    intervalSeconds = Math.max(intervalSeconds, result.value.intervalSeconds ?? 0);
    for (const record of result.value.records) {
      if (taskId == null || record.task_id === taskId) records.push(record);
    }
    if (client && result.value.windowLoss) clientWindowLoss[client] = { ...result.value.windowLoss };
    mergeTaskOrder(
      taskOrder,
      result.value.tasks.map((task) => task.id).filter((id) => taskId == null || id === taskId),
    );
    for (const task of result.value.tasks) {
      if (taskId != null && task.id !== taskId) continue;
      const previous = tasks.get(task.id);
      const routes = { ...previous?.routes, ...(task.route && client ? { [client]: task.route } : {}) };
      tasks.set(task.id, {
        ...task,
        route: undefined,
        routes,
        clients: [...new Set([...(previous?.clients ?? []), ...task.clients])],
      });
    }
  });
  return {
    records,
    tasks: taskOrder.flatMap((id) => {
      const task = tasks.get(id);
      return task ? [task] : [];
    }),
    taskAssignmentsKnown: true,
    failedEntityIds,
    successfulEntityIds,
    clientWindowLoss,
    intervalSeconds: intervalSeconds || undefined,
    ...rangeMeta(rangeForHours(hours)),
  };
}

// Kept for the public type used by the homepage store.
export type { PingOverviewItem };
