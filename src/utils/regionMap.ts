import { getCountryCodeFromRegion } from "@/utils/geo";

export interface RegionRule {
  /** 小写的服务器名或名称片段。 */
  pattern: string;
  code: string;
}

/**
 * 解析主题设置「服务器地区」：每行一条「服务器名=地区」，也可以用中文冒号或英文冒号分隔。
 * 地区可以是两位代码（HK）、国旗 emoji（🇭🇰）或国家名（香港、Japan）；认不出的行跳过。
 */
export function parseRegionMap(text: unknown): RegionRule[] {
  if (typeof text !== "string") return [];
  const rules: RegionRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.search(/[=:：]/);
    if (separator <= 0) continue;
    const pattern = line.slice(0, separator).trim().toLowerCase();
    const code = getCountryCodeFromRegion(line.slice(separator + 1).trim());
    if (pattern && code) rules.push({ pattern, code });
  }
  // 完整名称优先，其次是更长的片段。
  return rules.sort((left, right) => right.pattern.length - left.pattern.length);
}

/** 先找名称完全相同的规则，再找名称里包含的片段；都没有时返回 null。 */
export function regionFromRules(names: string[], rules: RegionRule[]): string | null {
  if (rules.length === 0) return null;
  const lowered = names.map((name) => name.trim().toLowerCase()).filter(Boolean);
  const exact = rules.find((rule) => lowered.includes(rule.pattern));
  if (exact) return exact.code;
  return rules.find((rule) => lowered.some((name) => name.includes(rule.pattern)))?.code ?? null;
}
