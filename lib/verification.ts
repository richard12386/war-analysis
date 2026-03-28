import type {
  Incident,
  IncidentSource,
  IncidentVerification,
} from "@/lib/incidents";

const TRUSTED_DOMAINS = [
  // Mezinarodni zpravodajske agentury
  "reuters.com",
  "apnews.com",
  "afp.com",
  // Britska media
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "ft.com",
  "economist.com",
  // Americka media
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
  "voanews.com",
  "rferl.org",
  // Blizky vychod / regionalni
  "aljazeera.com",
  "iranintl.com",
  "middleeasteye.net",
  "arabnews.com",
  "timesofisrael.com",
  "haaretz.com",
  "ynetnews.com",
  // Francouzska / nemecka media
  "france24.com",
  "dw.com",
  // Iranska oficialita a media
  "isna.ir",
  "tasnimnews.com",
  "mehrnews.com",
  "presstv.ir",
  // Izraelska oficialita
  "idf.il",
  "gov.il",
  // Americka a mezinarodni oficialita
  "state.gov",
  "un.org",
  "iaea.org",
  "icrc.org",
  "who.int",
  // NGO / lidska prava
  "amnesty.org",
  "hrw.org",
];

// Oficialní státní/vládní domény - dostávají bonus k trust score
const OFFICIAL_DOMAINS = [
  "state.gov",
  "un.org",
  "iaea.org",
  "idf.il",
  "gov.il",
  "who.int",
  "icrc.org",
];

// Domény považované za propagandistické nebo jednostranné - nesníží skóre,
// ale vyvolají signál pro redaktora
const SINGLE_PERSPECTIVE_DOMAINS = [
  "presstv.ir", // Iran state TV
];

export type VerificationReport = {
  trustScore: number;
  trustedSources: number;
  officialSources: number;
  totalSources: number;
  suspiciousSignals: string[];
  recommendation: IncidentVerification;
  note: string;
};

export function evaluateIncidentReliability(
  incident: Pick<Incident, "sources" | "summary" | "title">,
): VerificationReport {
  const sources = incident.sources ?? [];
  const trustedSources = sources.filter((source) => isTrustedSource(source)).length;
  const officialSources = sources.filter((source) => isOfficialSource(source)).length;
  const singlePerspectiveSources = sources.filter((source) =>
    isSinglePerspectiveSource(source),
  ).length;
  const suspiciousSignals: string[] = [];
  let trustScore = 0;

  // Zakladni skore od duveryhodnych zdroju (max 70)
  trustScore += Math.min(trustedSources * 35, 70);

  // Bonus za pocet zdroju celkem (max 20)
  trustScore += Math.min(sources.length * 10, 20);

  // Bonus za oficialní zdroje (vlady, OSN, IAEA) – max 20
  trustScore += Math.min(officialSources * 10, 20);

  // Bonus za vice zdroju s aspon jednim duveryhodnym
  if (sources.length >= 2 && trustedSources >= 1) {
    trustScore += 10;
  }

  // Suspiciozni signaly
  if (sources.length === 0) {
    suspiciousSignals.push("bez-zdroju");
  }

  if (trustedSources === 0 && sources.length > 0) {
    suspiciousSignals.push("bez-duveryhodneho-domenu");
  }

  if (sources.length === 1) {
    suspiciousSignals.push("jen-jeden-zdroj");
  }

  // Slaby nebo nepotvrzujici jazyk v titulku/shrnuti
  if (
    /(unconfirmed|rumor|nepotvrzen|údajně|udajne|podle socialnich siti|dle zdroju|zdroje tvrd|sources claim|reportedly|alleged|allegedly|zrejme|pravdepodobne|spekulace)/i.test(
      `${incident.title} ${incident.summary}`,
    )
  ) {
    suspiciousSignals.push("slaby-jazyk-nebo-povest");
    trustScore -= 15;
  }

  // Pouze propagandistický/jednostranný zdroj
  if (singlePerspectiveSources > 0 && trustedSources <= singlePerspectiveSources) {
    suspiciousSignals.push("jednostranny-zdroj");
  }

  // Clamp na 0-100
  trustScore = Math.max(0, Math.min(100, trustScore));

  let recommendation: IncidentVerification = "pending";
  if (trustScore >= 80 && trustedSources >= 2) {
    recommendation = "confirmed";
  } else if (trustScore < 35) {
    recommendation = "contested";
  }

  const note = buildNote(recommendation, trustedSources, officialSources, suspiciousSignals);

  return {
    trustScore,
    trustedSources,
    officialSources,
    totalSources: sources.length,
    suspiciousSignals,
    recommendation,
    note,
  };
}

function buildNote(
  recommendation: IncidentVerification,
  trustedSources: number,
  officialSources: number,
  signals: string[],
): string {
  if (recommendation === "confirmed") {
    const parts = [`Nalezeno ${trustedSources} duveryhodnych zdroju`];
    if (officialSources > 0) {
      parts.push(`vcetne ${officialSources} oficialniho zdroje`);
    }
    parts.push("– doporucena redakcni verifikace pred publikaci.");
    return parts.join(" ");
  }

  if (recommendation === "contested") {
    if (signals.includes("bez-zdroju")) {
      return "Zaznam nema zadne zdroje a nema byt publikovan jako potvrzeny.";
    }
    if (signals.includes("jednostranny-zdroj")) {
      return "Zaznam pochazi pouze z jednostranneho nebo propagandistickeho zdroje. Overit nezavislymi zdroji.";
    }
    return "Zaznam je slabe podlozeny nebo obsahuje nepotvrzujici jazyk. Nevhodny pro publikaci bez dalsich zdroju.";
  }

  // pending
  if (signals.includes("jen-jeden-zdroj")) {
    return "Jeden zdroj nestaci pro potvrzeni. Doporuceno doplnit dalsi nezavisle zdroje.";
  }
  if (signals.includes("bez-duveryhodneho-domenu")) {
    return "Zadny ze zdroju nepatri mezi proverovane domeny. Overit puvod informace.";
  }
  return "Zaznam ceka na redakcni potvrzeni a dalsi zdroje.";
}

export function isTrustedSource(source: IncidentSource) {
  try {
    const hostname = new URL(source.url).hostname.replace(/^www\./, "");
    return TRUSTED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function isOfficialSource(source: IncidentSource) {
  try {
    const hostname = new URL(source.url).hostname.replace(/^www\./, "");
    return OFFICIAL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function isSinglePerspectiveSource(source: IncidentSource) {
  try {
    const hostname = new URL(source.url).hostname.replace(/^www\./, "");
    return SINGLE_PERSPECTIVE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}
