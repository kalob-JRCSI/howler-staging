import { useEffect } from "react";
import { useHowlerStore } from "@/lib/howler/store";
import { isPhoneHowler } from "@/lib/howler/device";

export function useHowlerHydrated() {
  const hydrateFromStorage = useHowlerStore((state) => state.hydrateFromStorage);
  const pullRemote = useHowlerStore((state) => state.pullRemote);
  useEffect(() => {
    hydrateFromStorage();
    void pullRemote();
    const wait = isPhoneHowler() ? 6000 : 4000;
    let tick = 0;
    const loop = () => {
      if (document.visibilityState === "visible") void pullRemote();
    };
    tick = window.setInterval(loop, wait);
    const onVis = () => {
      if (document.visibilityState === "visible") void pullRemote();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hydrateFromStorage, pullRemote]);
  return true;
}
