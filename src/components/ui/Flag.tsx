import { useState } from "react";
import { getDisplayRegionCode } from "@/utils/geo";
import { publicAsset } from "@/utils/publicAsset";

interface FlagProps {
  region?: string | null;
  size?: number;
}

export function Flag({ region, size = 14 }: FlagProps) {
  const value = region?.trim() ?? "";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // 没有地区时不画占位块（FLYX 的服务器多数没有地区信息）。
  if (!value) return null;

  const flagCode = getDisplayRegionCode(value);
  const src = publicAsset(`assets/flags/${flagCode}.svg`);
  const alt = `地区旗帜: ${flagCode}`;

  if (failedSrc === src) {
    // 图片加载失败（例如面板前面的反代没有转发 /status/assets/）时退回国旗 emoji，
    // 不支持国旗 emoji 的系统（Windows）会显示成两个字母，仍能看出地区。
    const emoji = flagCode === "UN" ? "" : flagEmoji(flagCode);
    return (
      <span
        role="img"
        aria-label={alt}
        className="inline-flex items-center justify-center rounded-[3px] shrink-0"
        title={alt}
        style={{
          width: size + 8,
          height: size,
          fontSize: size * 0.9,
          lineHeight: 1,
          background: emoji ? undefined : "var(--border-subtle)",
        }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center shrink-0"
      style={{
        width: size + 8,
        height: size,
        lineHeight: 0,
      }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
        onError={() => setFailedSrc(src)}
      />
    </span>
  );
}

function flagEmoji(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}
