import { useQuery } from "@tanstack/react-query";
import { getPublic } from "@/services/api";
import type { PublicConfig } from "@/types/models";

export function usePublicConfig() {
  return useQuery<PublicConfig>({
    queryKey: ["public"],
    queryFn: ({ signal }) => getPublic({ signal }),
    staleTime: 60_000,
    refetchInterval: (query) => query.state.data?.theme_settings_error ? 30_000 : false,
  });
}

/** FLYX 管理员是否允许显示网速和流量；配置没到时按允许处理，避免首屏闪动。 */
export function useShowTraffic() {
  const { data } = usePublicConfig();
  return data?.show_traffic !== false;
}
