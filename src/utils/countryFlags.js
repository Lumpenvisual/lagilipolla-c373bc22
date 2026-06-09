// utils/countryFlags.js
// Mapping de 48 países WC2026 CON NOMBRES EN ESPAÑOL
// Códigos ISO 3166-1 alpha-2 para flag-icons

export const COUNTRY_FLAG_MAP = {
  // GRUPO A
  'México': 'mx',
  'Sudáfrica': 'za',
  'Corea del Sur': 'kr',
  'Chequía': 'cz',

  // GRUPO B
  'Canadá': 'ca',
  'Bosnia y Herzegovina': 'ba',
  'Catar': 'qa',
  'Suiza': 'ch',

  // GRUPO C
  'Brasil': 'br',
  'Marruecos': 'ma',
  'Haití': 'ht',
  'Escocia': 'gb-sct',

  // GRUPO D
  'Estados Unidos': 'us',
  'Paraguay': 'py',
  'Australia': 'au',
  'Turquía': 'tr',

  // GRUPO E
  'Alemania': 'de',
  'Curazao': 'cw',
  'Costa de Marfil': 'ci',
  'Ecuador': 'ec',

  // GRUPO F
  'Países Bajos': 'nl',
  'Japón': 'jp',
  'Suecia': 'se',
  'Túnez': 'tn',

  // GRUPO G
  'Bélgica': 'be',
  'Egipto': 'eg',
  'Irán': 'ir',
  'Nueva Zelanda': 'nz',

  // GRUPO H
  'España': 'es',
  'Cabo Verde': 'cv',
  'Arabia Saudita': 'sa',
  'Uruguay': 'uy',

  // GRUPO I
  'Francia': 'fr',
  'Senegal': 'sn',
  'Iraq': 'iq',
  'Noruega': 'no',

  // GRUPO J
  'Argentina': 'ar',
  'Argelia': 'dz',
  'Austria': 'at',
  'Jordania': 'jo',

  // GRUPO K
  'Portugal': 'pt',
  'RD Congo': 'cd',
  'Uzbekistán': 'uz',
  'Colombia': 'co',

  // GRUPO L
  'Inglaterra': 'gb-eng',
  'Croacia': 'hr',
  'Ghana': 'gh',
  'Panamá': 'pa',
};

export const getFlagCode = (countryName) => {
  if (!countryName) return 'un';

  const code = COUNTRY_FLAG_MAP[countryName.trim()];

  if (!code) {
    console.warn(`⚠️ Flag code not found for: "${countryName}"`);
    return 'un';
  }

  return code;
};

// Función para debug - verificar que todos los códigos existan
export const validateFlags = () => {
  const validCodes = ['mx','za','kr','cz','ca','ba','qa','ch','br','ma','ht','gb-sct','us','py','au','tr','de','cw','ci','ec','nl','jp','se','tn','be','eg','ir','nz','es','cv','sa','uy','fr','sn','iq','no','ar','dz','at','jo','pt','cd','uz','co','gb-eng','hr','gh','pa'];

  const mapCodes = Object.values(COUNTRY_FLAG_MAP);
  const missing = validCodes.filter(code => !mapCodes.includes(code));

  if (missing.length === 0) {
    console.log('✅ Todas las banderas están configuradas correctamente');
  } else {
    console.warn('❌ Códigos de bandera faltantes:', missing);
  }
};

export const COUNTRY_FLAGS_EMOJI = {
  'México': '🇲🇽',
  'Sudáfrica': '🇿🇦',
  'Corea del Sur': '🇰🇷',
  'Chequía': '🇨🇿',
  'Canadá': '🇨🇦',
  'Bosnia y Herzegovina': '🇧🇦',
  'Catar': '🇶🇦',
  'Suiza': '🇨🇭',
  'Brasil': '🇧🇷',
  'Marruecos': '🇲🇦',
  'Haití': '🇭🇹',
  'Escocia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Estados Unidos': '🇺🇸',
  'Paraguay': '🇵🇾',
  'Australia': '🇦🇺',
  'Turquía': '🇹🇷',
  'Alemania': '🇩🇪',
  'Curazao': '🇨🇼',
  'Costa de Marfil': '🇨🇮',
  'Ecuador': '🇪🇨',
  'Países Bajos': '🇳🇱',
  'Japón': '🇯🇵',
  'Suecia': '🇸🇪',
  'Túnez': '🇹🇳',
  'Bélgica': '🇧🇪',
  'Egipto': '🇪🇬',
  'Irán': '🇮🇷',
  'Nueva Zelanda': '🇳🇿',
  'España': '🇪🇸',
  'Cabo Verde': '🇨🇻',
  'Arabia Saudita': '🇸🇦',
  'Uruguay': '🇺🇾',
  'Francia': '🇫🇷',
  'Senegal': '🇸🇳',
  'Iraq': '🇮🇶',
  'Noruega': '🇳🇴',
  'Argentina': '🇦🇷',
  'Argelia': '🇩🇿',
  'Austria': '🇦🇹',
  'Jordania': '🇯🇴',
  'Portugal': '🇵🇹',
  'RD Congo': '🇨🇩',
  'Uzbekistán': '🇺🇿',
  'Colombia': '🇨🇴',
  'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croacia': '🇭🇷',
  'Ghana': '🇬🇭',
  'Panamá': '🇵🇦',
};

export const getFlagEmoji = (countryName) =>
  COUNTRY_FLAGS_EMOJI[countryName?.trim()] || '🌍';
