export const COUNTRY_FLAG_MAP = {

  // CONCACAF

  'Mexico': 'mx',

  'USA': 'us',

  'Canada': 'ca',

  'Panama': 'pa',

  'Haiti': 'ht',

  'Jamaica': 'jm',

  'Costa Rica': 'cr',

  'Curaçao': 'cw',

  

  // CONMEBOL

  'Brazil': 'br',

  'Argentina': 'ar',

  'Uruguay': 'uy',

  'Colombia': 'co',

  'Ecuador': 'ec',

  'Paraguay': 'py',

  'Peru': 'pe',

  

  // UEFA - Críticos (estos suelen fallar)

  'England': 'gb-eng',      // ⚠️ NO es 'gb', es 'gb-eng'

  'Scotland': 'gb-sct',     // ⚠️ NO es 'gb', es 'gb-sct'

  'Wales': 'gb-wls',        // Si participa

  'France': 'fr',

  'Spain': 'es',

  'Germany': 'de',

  'Italy': 'it',

  'Netherlands': 'nl',

  'Belgium': 'be',

  'Portugal': 'pt',

  'Poland': 'pl',

  'Austria': 'at',

  'Switzerland': 'ch',

  'Sweden': 'se',

  'Denmark': 'dk',

  'Norway': 'no',

  'Croatia': 'hr',

  'Serbia': 'rs',

  'Bosnia & Herzegovina': 'ba',  // ⚠️ NO era 'bo', es 'ba'

  'Montenegro': 'me',

  'Albania': 'al',

  'Bulgaria': 'bg',

  'Romania': 'ro',

  'Hungary': 'hu',

  'Slovakia': 'sk',

  'Czechia': 'cz',

  'Ukraine': 'ua',

  'Georgia': 'ge',

  'Greece': 'gr',

  'Slovenia': 'si',

  'Turkey': 'tr',

  'Türkiye': 'tr',           // Ambas variantes

  

  // AFC - Críticos

  'Japan': 'jp',

  'South Korea': 'kr',       // ⚠️ NO era 'sk' (eso es Slovakia)

  'Australia': 'au',

  'Iraq': 'iq',

  'Jordan': 'jo',

  'Iran': 'ir',

  'Saudi Arabia': 'sa',

  'Qatar': 'qa',             // ⚠️ NO era 'at' (eso es Austria)

  'Uzbekistan': 'uz',

  

  // CAF

  'Egypt': 'eg',

  'Morocco': 'ma',

  'Tunisia': 'tn',

  'Senegal': 'sn',

  'Ivory Coast': 'ci',

  'Ghana': 'gh',

  'Cape Verde': 'cv',

  'Cameroon': 'cm',

  'South Africa': 'za',

  'Nigeria': 'ng',

  'Mali': 'ml',

  'DR Congo': 'cd',

  'Congo': 'cg',

  'Kenya': 'ke',

  'Uganda': 'ug',

  'Ethiopia': 'et',

  'Algeria': 'dz',

  'Libya': 'ly',

  'Sudan': 'sd',

  'Tanzania': 'tz',

  

  // OFC

  'New Zealand': 'nz',

  

  // Otros

  'Curaçao': 'cw',

};

export const getFlagCode = (countryName) => {

  // Intenta match exacto primero

  if (COUNTRY_FLAG_MAP[countryName]) {

    return COUNTRY_FLAG_MAP[countryName];

  }

  

  // Si no encuentra, intenta sin espacios extras

  const trimmed = countryName?.trim();

  if (COUNTRY_FLAG_MAP[trimmed]) {

    return COUNTRY_FLAG_MAP[trimmed];

  }

  

  // Fallback: retorna 'un' (bandera genérica de Naciones Unidas)

  console.warn(`Flag code not found for: ${countryName}`);

  return 'un';

};