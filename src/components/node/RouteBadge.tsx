import { memo } from "react";
import { clsx } from "clsx";

/** 回程线路标记（FLYX 公开接口 ping[].route，如「CN2 GIA」「9929」），没有检测结果时不显示。 */
export const RouteBadge = memo(function RouteBadge({
  route,
  compact = false,
  className,
}: {
  route?: string;
  compact?: boolean;
  className?: string;
}) {
  const text = route?.trim();
  if (!text) return null;
  // 双栈时 route 形如「163 / v6 CN2 GT」，徽标只放第一段，完整内容在提示里。
  const short = text.split(" / ")[0];
  return (
    <span
      className={clsx("ping-route-badge", compact && "is-compact", className)}
      title={`回程线路：${text}`}
    >
      {short}
    </span>
  );
});
