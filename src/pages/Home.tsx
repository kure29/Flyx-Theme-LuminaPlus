import { useEffect, useState } from "react";
import { NodeGrid } from "@/components/node/NodeGrid";
import { FloatingControls } from "@/components/shell/FloatingControls";
import { useNodeStoreStatus } from "@/hooks/useNode";
import { useThemeSettings } from "@/hooks/useThemeSettings";

let homeHeaderHiddenForDocument = false;

function HomeDashboard() {
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [headerHiddenForDocument, setHeaderHiddenForDocument] = useState(
    () => homeHeaderHiddenForDocument,
  );
  const themeSettings = useThemeSettings();
  const { hydrated: storeHydrated } = useNodeStoreStatus();
  const homeReady = themeSettings.isReady && storeHydrated;
  const homeHeaderHidden =
    themeSettings.enableHomeHeaderAutoHide && headerHiddenForDocument;

  useEffect(() => {
    if (
      !homeReady ||
      !themeSettings.enableHomeHeaderAutoHide ||
      headerHiddenForDocument
    ) return;
    const timeoutId = window.setTimeout(() => {
      homeHeaderHiddenForDocument = true;
      setHeaderHiddenForDocument(true);
    }, themeSettings.homeHeaderVisibleSeconds * 1000);
    return () => window.clearTimeout(timeoutId);
  }, [
    headerHiddenForDocument,
    homeReady,
    themeSettings.enableHomeHeaderAutoHide,
    themeSettings.homeHeaderVisibleSeconds,
  ]);

  return (
    <div
      className={`home-dashboard relative pb-2${controlsExpanded ? " is-controls-expanded" : ""}${homeHeaderHidden ? " is-home-header-hidden" : ""}`}
    >
      {homeReady && <FloatingControls onExpandedChange={setControlsExpanded} />}
      <NodeGrid />
    </div>
  );
}

export function Home() {
  return <HomeDashboard />;
}
