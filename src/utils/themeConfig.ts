import manifest from "../../theme.json";

/**
 * theme.json 里 `config` 声明的设置项。FLYX 后台只保存与默认值不同的项，
 * 读到的值也可能来自旧版本主题，所以这里按声明补默认值并检查类型和范围，
 * 不合法的值一律换成默认值。
 */
interface ConfigItem {
  key?: string;
  type: string;
  default?: unknown;
  min?: number;
  max?: number;
  options?: Array<{ value: string }>;
}

const ITEMS = ((manifest as { config?: ConfigItem[] }).config ?? []).filter(
  (item): item is ConfigItem & { key: string } => typeof item.key === "string" && item.type !== "title",
);

function valid(item: ConfigItem, value: unknown): boolean {
  switch (item.type) {
    case "string":
    case "text":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (item.min == null || value >= item.min) &&
        (item.max == null || value <= item.max)
      );
    case "select":
      return typeof value === "string" && (item.options ?? []).some((option) => option.value === value);
    default:
      return false;
  }
}

/** 已声明的项：保存值合法就用保存值，否则用 theme.json 的默认值；未声明的键原样保留。 */
export function resolveThemeConfig(values: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...values };
  for (const item of ITEMS) {
    resolved[item.key] = valid(item, values[item.key]) ? values[item.key] : item.default;
  }
  return resolved;
}

export const THEME_CONFIG_KEYS = ITEMS.map((item) => item.key);
