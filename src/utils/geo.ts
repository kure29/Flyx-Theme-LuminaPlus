const REGIONAL_INDICATOR_MIN = 0x1f1e6;
const REGIONAL_INDICATOR_MAX = 0x1f1ff;
const ASCII_ALPHA_START = 0x41;
const FLAG_EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
const ISO_CODE_RE = /\b[A-Z]{2}\b/g;

const ISO_3166_ALPHA2 = new Set(
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET EU FI FJ FK FM " +
    "FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT " +
    "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN " +
    "MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT " +
    "PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL " +
    "TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
  ).split(" "),
);

const REGION_ALIASES: Record<string, string> = {
  argentina: "AR",
  america: "US",
  australia: "AU",
  austria: "AT",
  belgium: "BE",
  brazil: "BR",
  britain: "GB",
  canada: "CA",
  chile: "CL",
  china: "CN",
  cn: "CN",
  denmark: "DK",
  de: "DE",
  deutschland: "DE",
  europa: "EU",
  europe: "EU",
  france: "FR",
  germany: "DE",
  hk: "HK",
  hongkong: "HK",
  "hong kong": "HK",
  india: "IN",
  indonesia: "ID",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  japan: "JP",
  korea: "KR",
  malaysia: "MY",
  mexico: "MX",
  netherlands: "NL",
  norway: "NO",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  russia: "RU",
  singapore: "SG",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  taiwan: "TW",
  thailand: "TH",
  turkey: "TR",
  uk: "GB",
  uae: "AE",
  "united arab emirates": "AE",
  unitedkingdom: "GB",
  unitedstates: "US",
  us: "US",
  usa: "US",
  vietnam: "VN",
  阿根廷: "AR",
  奥地利: "AT",
  奧地利: "AT",
  比利时: "BE",
  比利時: "BE",
  巴西: "BR",
  中国: "CN",
  中國: "CN",
  台湾: "TW",
  台灣: "TW",
  香港: "HK",
  澳门: "MO",
  澳門: "MO",
  日本: "JP",
  韩国: "KR",
  韓國: "KR",
  新加坡: "SG",
  印度: "IN",
  印尼: "ID",
  印度尼西亚: "ID",
  印度尼西亞: "ID",
  马来西亚: "MY",
  馬來西亞: "MY",
  美国: "US",
  美國: "US",
  英国: "GB",
  英國: "GB",
  德国: "DE",
  德國: "DE",
  法国: "FR",
  法國: "FR",
  加拿大: "CA",
  澳大利亚: "AU",
  澳大利亞: "AU",
  澳洲: "AU",
  荷兰: "NL",
  荷蘭: "NL",
  爱尔兰: "IE",
  愛爾蘭: "IE",
  意大利: "IT",
  西班牙: "ES",
  葡萄牙: "PT",
  瑞典: "SE",
  瑞士: "CH",
  挪威: "NO",
  丹麦: "DK",
  丹麥: "DK",
  波兰: "PL",
  波蘭: "PL",
  俄罗斯: "RU",
  俄羅斯: "RU",
  土耳其: "TR",
  泰国: "TH",
  泰國: "TH",
  越南: "VN",
  菲律宾: "PH",
  菲律賓: "PH",
  墨西哥: "MX",
  智利: "CL",
  以色列: "IL",
  阿联酋: "AE",
  阿聯酋: "AE",
  欧洲: "EU",
  歐洲: "EU",
};

function countryCodeFromFlagEmoji(input: string): string | null {
  const chars = Array.from(input);
  if (chars.length !== 2) return null;

  const first = chars[0].codePointAt(0) ?? 0;
  const second = chars[1].codePointAt(0) ?? 0;
  const valid =
    first >= REGIONAL_INDICATOR_MIN &&
    first <= REGIONAL_INDICATOR_MAX &&
    second >= REGIONAL_INDICATOR_MIN &&
    second <= REGIONAL_INDICATOR_MAX;

  if (!valid) return null;

  return String.fromCodePoint(
    first - REGIONAL_INDICATOR_MIN + ASCII_ALPHA_START,
    second - REGIONAL_INDICATOR_MIN + ASCII_ALPHA_START,
  );
}

export function getCountryCodeFromRegion(region: string | null | undefined): string | null {
  const raw = region?.trim();
  if (!raw) return null;

  const emoji = raw.match(FLAG_EMOJI_RE)?.[0];
  if (emoji) return countryCodeFromFlagEmoji(emoji);

  const normalized = raw
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliased = REGION_ALIASES[normalized] ?? REGION_ALIASES[normalized.replace(/\s+/g, "")];
  if (aliased) return aliased;

  const upper = raw.toUpperCase();
  const resolveToken = (token: string) => (token === "UK" ? "GB" : token);
  const isValidToken = (token: string) =>
    token === "UK" || ISO_3166_ALPHA2.has(token);

  const whole = upper.match(/^[A-Z]{2}$/)?.[0];
  if (whole && isValidToken(whole)) return resolveToken(whole);

  for (const match of raw.matchAll(ISO_CODE_RE)) {
    const token = match[0];
    if (isValidToken(token)) return resolveToken(token);
  }

  return null;
}

export function getDisplayRegionCode(region: string | null | undefined) {
  return getCountryCodeFromRegion(region) ?? "UN";
}

// 名称里常见的城市名（地区识别用，国家名已在 REGION_ALIASES 里）。
const CITY_ALIASES: Record<string, string> = {
  东京: "JP", 東京: "JP", 大阪: "JP", 埼玉: "JP", tokyo: "JP", osaka: "JP",
  首尔: "KR", 首爾: "KR", 春川: "KR", seoul: "KR",
  台北: "TW", 新北: "TW", 台中: "TW", 彰化: "TW", taipei: "TW",
  洛杉矶: "US", 洛杉磯: "US", 圣何塞: "US", 聖荷西: "US", 硅谷: "US", 矽谷: "US", 西雅图: "US",
  纽约: "US", 紐約: "US", 芝加哥: "US", 达拉斯: "US", 凤凰城: "US", 迈阿密: "US", 弗里蒙特: "US",
  "los angeles": "US", "san jose": "US", seattle: "US", "new york": "US", chicago: "US",
  dallas: "US", phoenix: "US", miami: "US", fremont: "US", "silicon valley": "US",
  伦敦: "GB", 倫敦: "GB", london: "GB",
  法兰克福: "DE", 法蘭克福: "DE", 纽伦堡: "DE", frankfurt: "DE", nuremberg: "DE",
  阿姆斯特丹: "NL", amsterdam: "NL", 巴黎: "FR", paris: "FR",
  莫斯科: "RU", moscow: "RU", 迪拜: "AE", 杜拜: "AE", dubai: "AE",
  孟买: "IN", mumbai: "IN", 悉尼: "AU", 雪梨: "AU", sydney: "AU", 多伦多: "CA", toronto: "CA",
  吉隆坡: "MY", "kuala lumpur": "MY", 曼谷: "TH", bangkok: "TH", 胡志明: "VN", 河内: "VN",
  马尼拉: "PH", manila: "PH", 雅加达: "ID", jakarta: "ID", 伊斯坦布尔: "TR", istanbul: "TR",
  上海: "CN", 北京: "CN", 广州: "CN", 深圳: "CN", 杭州: "CN", 成都: "CN", 南京: "CN",
};

const FLAG_ANYWHERE_RE = /[\s\u{FE0F}]*([\u{1F1E6}-\u{1F1FF}]{2})[\s\u{FE0F}]*/u;
// 2 个大写字母的代码要求前后不是字母；这几个常与别的写法撞车（AS9929、AM/PM、TV）。
const ISO_TOKEN_RE = /(?:^|[^A-Za-z])([A-Z]{2})(?=[^A-Za-z]|$)/g;
const AMBIGUOUS_ISO_TOKENS = new Set(["AS", "AM", "PM", "TV", "IP", "ME", "IT", "NO", "TO", "GO", "BE", "IS"]);

const NAME_ALIASES = Object.entries({ ...REGION_ALIASES, ...CITY_ALIASES })
  // 太短的英文缩写（us、de、hk、cn、uk）由下面的大写代码规则处理，避免误伤普通单词。
  .filter(([alias]) => /[^\x00-\x7f]/.test(alias) || alias.length >= 4)
  .sort(([left], [right]) => right.length - left.length);

function aliasMatches(lowerName: string, alias: string) {
  if (/[^\x00-\x7f]/.test(alias)) return lowerName.includes(alias);
  const index = lowerName.indexOf(alias);
  if (index < 0) return false;
  const before = lowerName[index - 1];
  const after = lowerName[index + alias.length];
  return !(before && /[a-z]/.test(before)) && !(after && /[a-z]/.test(after));
}

/**
 * FLYX 没有地区字段，从服务器名推断：
 * 1. 国旗 emoji（任意位置，如「🇭🇰 香港 01」「香港 🇭🇰」），名称里去掉这面旗（卡片已经单独显示旗帜）；
 * 2. 国家或城市名（「香港 01」「东京 IIJ」「Los Angeles」）；
 * 3. 独立的两位大写代码（「HK-01」「JP Tokyo」「[SG] ARM」）。
 * 都没有时地区为空。
 */
export function splitFlagName(name: string): { region: string; name: string } {
  const trimmed = name.trim();
  const flag = trimmed.match(FLAG_ANYWHERE_RE);
  const flagCode = flag ? countryCodeFromFlagEmoji(flag[1]) : null;
  if (flag && flagCode) {
    const index = flag.index ?? 0;
    const rest = `${trimmed.slice(0, index)} ${trimmed.slice(index + flag[0].length)}`
      // 旗帜去掉后留下的空括号（「[🇭🇰] 香港」）和首尾分隔符一并去掉。
      .replace(/\[\s*\]|\(\s*\)|【\s*】/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s|·\-_/]+|[\s|·\-_/]+$/g, "")
      .trim();
    return { region: flagCode, name: rest || trimmed };
  }

  const lower = trimmed.toLowerCase();
  for (const [alias, code] of NAME_ALIASES) {
    if (aliasMatches(lower, alias)) return { region: code, name: trimmed };
  }

  for (const match of trimmed.matchAll(ISO_TOKEN_RE)) {
    const token = match[1];
    if (AMBIGUOUS_ISO_TOKENS.has(token)) continue;
    if (token === "UK") return { region: "GB", name: trimmed };
    if (ISO_3166_ALPHA2.has(token)) return { region: token, name: trimmed };
  }
  return { region: "", name: trimmed };
}
