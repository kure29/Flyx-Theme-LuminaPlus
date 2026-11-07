import { Outlet, useLocation } from "react-router-dom";
import { BackgroundLayer } from "./BackgroundLayer";
import { AmbientEffectLayer } from "./AmbientEffectLayer";
import { Spinner } from "@/components/ui/Spinner";
import { useAppearance } from "@/hooks/useAppearance";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useSiteMetadata } from "@/hooks/useSiteMetadata";
import { useMetricColorsSync } from "@/hooks/useMetricColors";
import { useNodeStoreStatus } from "@/hooks/useNode";
import { ApiRequestError } from "@/services/api";
import { PwaPullToRefresh } from "./PwaPullToRefresh";

export function AppShell() {
  useAppearance();
  useSiteMetadata();
  useMetricColorsSync();
  const { pathname } = useLocation();
  const publicConfig = usePublicConfig();
  const normalizedPath = (pathname.replace(/\/+$/, "") || "/").toLowerCase();
  const isDataRoute =
    normalizedPath === "/" ||
    normalizedPath === "/assets" ||
    normalizedPath === "/traffic" ||
    normalizedPath.startsWith("/instance/");
  const isCheckingAccess = isDataRoute && publicConfig.isPending;
  const accessError = isDataRoute && publicConfig.isError && !publicConfig.data;
  const isHomeDashboard = normalizedPath === "/";
  const pullRefreshActive = isDataRoute;
  const canHydrateHome = isHomeDashboard && !isCheckingAccess && !accessError;
  const homeStoreStatus = useNodeStoreStatus(canHydrateHome);
  const isCheckingHomeData =
    canHydrateHome && !homeStoreStatus.hydrated && !homeStoreStatus.nodeInfoError;
  const isCheckingShell = isCheckingAccess || isCheckingHomeData;
  return (
    <div className="relative flex min-h-screen flex-col">
      <PwaPullToRefresh active={pullRefreshActive} />
      <BackgroundLayer />
      <AmbientEffectLayer />
      <main className="app-main flex-1 px-3 pb-8 sm:px-5 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1720px]">
          {isCheckingShell ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <Spinner size={24} />
            </div>
          ) : accessError ? (
            <AccessError error={publicConfig.error} onRetry={() => void publicConfig.refetch()} />
          ) : (
            <Outlet />
          )}
        </div>
      </main>
    </div>
  );
}

function isStatusPageDisabled(error: unknown) {
  return error instanceof ApiRequestError && error.status === 404;
}

function siteConfigErrorMessage(error: unknown) {
  if (isStatusPageDisabled(error)) {
    return "管理员还没有开启状态页，或已经将其关闭。";
  }
  if (error instanceof ApiRequestError) {
    return `状态接口返回错误（${error.status}）：${error.message}`;
  }
  if (error instanceof SyntaxError) {
    return "状态接口未返回有效数据，请检查 FLYX 版本或反向代理。";
  }
  return "状态接口暂时无法连接，请检查网络后重试。";
}

function AccessError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <div className="text-[15px] font-semibold text-[var(--text-primary)]">
          {isStatusPageDisabled(error) ? "状态页未开启" : "无法读取状态数据"}
        </div>
        <p className="text-[13px] text-[var(--text-secondary)]">{siteConfigErrorMessage(error)}</p>
      </div>
      <button type="button" onClick={onRetry} className="control-button px-4 py-2 text-[13px] font-medium">
        重试
      </button>
    </div>
  );
}
