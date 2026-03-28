"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LiveRefresh({ intervalMs = 300000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState(intervalMs);

  const runRefresh = useEffectEvent(() => {
    router.refresh();
    setRemainingMs(intervalMs);
  });

  useEffect(() => {
    const countdown = window.setInterval(() => {
      setRemainingMs((current) => (current <= 1000 ? intervalMs : current - 1000));
    }, 1000);

    const refresh = window.setInterval(() => {
      runRefresh();
    }, intervalMs);

    return () => {
      window.clearInterval(countdown);
      window.clearInterval(refresh);
    };
  }, [intervalMs]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  return (
    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] text-white/65">
      Auto refresh {String(minutes).padStart(2, "0")}:
      {String(seconds).padStart(2, "0")}
    </div>
  );
}
