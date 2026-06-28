import { cn } from "@/lib/utils";

// Country name → flag code (flagcdn / ISO 3166-1 alpha-2, plus gb-eng etc).
const FLAGS: Record<string, string> = {
  southafrica: "za",
  canada: "ca",
  brazil: "br",
  japan: "jp",
  germany: "de",
  paraguay: "py",
  netherlands: "nl",
  morocco: "ma",
  ivorycoast: "ci",
  cotedivoire: "ci",
  norway: "no",
  france: "fr",
  sweden: "se",
  mexico: "mx",
  ecuador: "ec",
  england: "gb-eng",
  wales: "gb-wls",
  scotland: "gb-sct",
  northernireland: "gb-nir",
  congodr: "cd",
  drcongo: "cd",
  congo: "cg",
  belgium: "be",
  senegal: "sn",
  unitedstates: "us",
  usa: "us",
  bosniaherzegovina: "ba",
  bosniaandherzegovina: "ba",
  spain: "es",
  austria: "at",
  portugal: "pt",
  croatia: "hr",
  argentina: "ar",
  uruguay: "uy",
  colombia: "co",
  switzerland: "ch",
  denmark: "dk",
  poland: "pl",
  italy: "it",
  serbia: "rs",
  australia: "au",
  southkorea: "kr",
  korearepublic: "kr",
  korea: "kr",
  saudiarabia: "sa",
  iran: "ir",
  iriran: "ir",
  qatar: "qa",
  tunisia: "tn",
  algeria: "dz",
  egypt: "eg",
  nigeria: "ng",
  ghana: "gh",
  cameroon: "cm",
  mali: "ml",
  costarica: "cr",
  panama: "pa",
  honduras: "hn",
  jamaica: "jm",
  peru: "pe",
  chile: "cl",
  venezuela: "ve",
  bolivia: "bo",
  newzealand: "nz",
  turkey: "tr",
  turkiye: "tr",
  greece: "gr",
  ukraine: "ua",
  czechrepublic: "cz",
  czechia: "cz",
  romania: "ro",
  hungary: "hu",
  slovenia: "si",
  slovakia: "sk",
  russia: "ru",
  capeverde: "cv",
  caboverde: "cv",
  curacao: "cw",
  haiti: "ht",
  uzbekistan: "uz",
  jordan: "jo",
  iraq: "iq",
  unitedarabemirates: "ae",
  uae: "ae",
  oman: "om",
  bahrain: "bh",
  kuwait: "kw",
  china: "cn",
  chinapr: "cn",
  india: "in",
  indonesia: "id",
  thailand: "th",
  vietnam: "vn",
  angola: "ao",
  gabon: "ga",
  burkinafaso: "bf",
  guinea: "gn",
  zambia: "zm",
  benin: "bj",
  madagascar: "mg",
  mozambique: "mz",
  namibia: "na",
  equatorialguinea: "gq",
  mauritania: "mr",
  sudan: "sd",
  libya: "ly",
  kenya: "ke",
  tanzania: "tz",
  uganda: "ug",
  togo: "tg",
  niger: "ne",
  comoros: "km",
  gambia: "gm",
  sierraleone: "sl",
  liberia: "lr",
  ethiopia: "et",
  centralafricanrepublic: "cf",
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export function flagCode(name: string | null | undefined): string | null {
  if (!name) return null;
  return FLAGS[normalize(name)] ?? null;
}

/** Small country flag, or nothing if the name isn't a known nation (TBD etc). */
export function Flag({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const code = flagCode(name);
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt=""
      loading="lazy"
      className={cn(
        "inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-white/10",
        className,
      )}
    />
  );
}
