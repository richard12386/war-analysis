import type { Metadata } from "next";
import { Suspense } from "react";
import { getSortedIncidents } from "@/lib/incidents";
import TimelineClient from "./timeline-client";

export const metadata: Metadata = {
  title: "Timeline",
  description: "Chronologický přehled všech událostí od prvního dne války.",
};

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const incidents = await getSortedIncidents();

  return (
    <main className="shell min-h-screen px-5 py-6 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-3xl">
        <Suspense>
          <TimelineClient incidents={incidents} />
        </Suspense>
      </div>
    </main>
  );
}
