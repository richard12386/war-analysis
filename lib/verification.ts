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
    const parts = [`Nalezeno ${trustedSources} důvěryhodných zdrojů`];
    if (officialSources > 0) {
      parts.push(`včetně ${officialSources} oficiálního zdroje`);
    }
    parts.push("– doporučena redakční verifikace před publikací.");
    return parts.join(" ");
  }

  if (recommendation === "contested") {
    if (signals.includes("bez-zdroju")) {
      return "Záznam nemá žádné zdroje a nesmí být publikován jako potvrzený.";
    }
    if (signals.includes("jednostranny-zdroj")) {
      return "Záznam pochází pouze z jednostranného nebo propagandistického zdroje. Ověřit nezávislými zdroji.";
    }
    return "Záznam je slabě podložený nebo obsahuje nepotvrzující jazyk. Nevhodný pro publikaci bez dalších zdrojů.";
  }

  // pending
  if (signals.includes("jen-jeden-zdroj")) {
    return "Jeden zdroj nestačí pro potvrzení. Doporučeno doplnit další nezávislé zdroje.";
  }
  if (signals.includes("bez-duveryhodneho-domenu")) {
    return "Žádný ze zdrojů nepatří mezi prověřované domény. Ověřit původ informace.";
  }
  return "Záznam čeká na redakční potvrzení a další zdroje.";
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
