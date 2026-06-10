// Mapping de los 48 países WC2026 (nombres en español, como vienen en tournament_state)
// a códigos ISO 3166-1 alpha-2; las banderas viven en public/flags/<code>.svg.
export const COUNTRY_FLAG_MAP: Record<string, string> = {
  // GRUPO A
  México: "mx",
  Sudáfrica: "za",
  "Corea del Sur": "kr",
  Chequía: "cz",

  // GRUPO B
  Canadá: "ca",
  "Bosnia y Herzegovina": "ba",
  Catar: "qa",
  Suiza: "ch",

  // GRUPO C
  Brasil: "br",
  Marruecos: "ma",
  Haití: "ht",
  Escocia: "gb-sct",

  // GRUPO D
  "Estados Unidos": "us",
  Paraguay: "py",
  Australia: "au",
  Turquía: "tr",

  // GRUPO E
  Alemania: "de",
  Curazao: "cw",
  "Costa de Marfil": "ci",
  Ecuador: "ec",

  // GRUPO F
  "Países Bajos": "nl",
  Japón: "jp",
  Suecia: "se",
  Túnez: "tn",

  // GRUPO G
  Bélgica: "be",
  Egipto: "eg",
  Irán: "ir",
  "Nueva Zelanda": "nz",

  // GRUPO H
  España: "es",
  "Cabo Verde": "cv",
  "Arabia Saudita": "sa",
  Uruguay: "uy",

  // GRUPO I
  Francia: "fr",
  Senegal: "sn",
  Iraq: "iq",
  Noruega: "no",

  // GRUPO J
  Argentina: "ar",
  Argelia: "dz",
  Austria: "at",
  Jordania: "jo",

  // GRUPO K
  Portugal: "pt",
  "RD Congo": "cd",
  Uzbekistán: "uz",
  Colombia: "co",

  // GRUPO L
  Inglaterra: "gb-eng",
  Croacia: "hr",
  Ghana: "gh",
  Panamá: "pa",
};

export const getFlagCode = (countryName: string | null | undefined): string => {
  if (!countryName) return "un";
  return COUNTRY_FLAG_MAP[countryName.trim()] ?? "un";
};
