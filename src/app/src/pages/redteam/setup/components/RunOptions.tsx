import { useState, useCallback, useMemo } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import { FormControlLabel, Switch, Autocomplete, TextField, Chip } from '@mui/material';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { Config } from '../types';
import type { RedteamRunOptions } from '@promptfoo/types';

// Shared helper and error text constants for RunOptions inputs
export const RUNOPTIONS_TEXT = {
  numberOfTests: {
    helper: 'Number of test cases to generate for each plugin',
    error: 'Number of test cases must be greater than 0',
  },
  delayBetweenApiCalls: {
    helper:
      'Add a delay between API calls to avoid rate limits. This will not override a delay set on the target.',
    error: 'Delay must be 0 or greater',
  },
  maxConcurrentRequests: {
    helper: 'The maximum number of concurrent requests to make to the target.',
    error: 'Max number of concurrent requests must be greater than 0',
  },
  languages: {
    helper:
      'Specify languages to generate multilingual tests. Leave empty to generate tests only in English.',
    label: 'Test Languages',
  },
} as const;

// Common language suggestions for autocomplete (184 languages to match cloud)
// Complete list of 486 ISO 639-2 languages (matching cloud implementation)
// Sorted alphabetically for easy browsing
const COMMON_LANGUAGES = [
  'Abkhazian',
  'Achinese',
  'Acoli',
  'Adangme',
  'Adyghe',
  'Afar',
  'Afrihili',
  'Afrikaans',
  'Afro-Asiatic languages',
  'Ainu',
  'Akan',
  'Akkadian',
  'Albanian',
  'Aleut',
  'Algonquian languages',
  'Altaic languages',
  'Amharic',
  'Angika',
  'Apache languages',
  'Arabic',
  'Aragonese',
  'Arapaho',
  'Arawak',
  'Armenian',
  'Aromanian',
  'Artificial languages',
  'Assamese',
  'Asturian',
  'Athapascan languages',
  'Australian languages',
  'Austronesian languages',
  'Avaric',
  'Avestan',
  'Awadhi',
  'Aymara',
  'Azerbaijani',
  'Balinese',
  'Baltic languages',
  'Baluchi',
  'Bambara',
  'Bamileke languages',
  'Banda languages',
  'Bantu languages',
  'Basa',
  'Bashkir',
  'Basque',
  'Batak languages',
  'Beja',
  'Belarusian',
  'Bemba',
  'Bengali',
  'Berber languages',
  'Bhojpuri',
  'Bihari languages',
  'Bikol',
  'Bini',
  'Bislama',
  'Blin',
  'Blissymbols',
  'Bosnian',
  'Braj',
  'Breton',
  'Buginese',
  'Bulgarian',
  'Buriat',
  'Burmese',
  'Caddo',
  'Catalan',
  'Caucasian languages',
  'Cebuano',
  'Celtic languages',
  'Central American Indian languages',
  'Central Khmer',
  'Chagatai',
  'Chamic languages',
  'Chamorro',
  'Chechen',
  'Cherokee',
  'Cheyenne',
  'Chibcha',
  'Chichewa',
  'Chinese',
  'Chinook jargon',
  'Chipewyan',
  'Choctaw',
  'Church Slavic',
  'Chuukese',
  'Chuvash',
  'Classical Newari',
  'Classical Syriac',
  'Coptic',
  'Cornish',
  'Corsican',
  'Cree',
  'Creek',
  'Creoles and pidgins',
  'Creoles and pidgins, English based',
  'Creoles and pidgins, French-based',
  'Creoles and pidgins, Portuguese-based',
  'Crimean Tatar',
  'Croatian',
  'Cushitic languages',
  'Czech',
  'Dakota',
  'Danish',
  'Dargwa',
  'Delaware',
  'Dinka',
  'Divehi',
  'Dogri',
  'Dravidian languages',
  'Duala',
  'Dutch',
  'Dutch, Middle (ca.1050-1350)',
  'Dyula',
  'Dzongkha',
  'Eastern Frisian',
  'Efik',
  'Egyptian (Ancient)',
  'Ekajuk',
  'Elamite',
  'English',
  'English, Middle (1100-1500)',
  'English, Old (ca.450-1100)',
  'Erzya',
  'Esperanto',
  'Estonian',
  'Ewe',
  'Ewondo',
  'Fang',
  'Fanti',
  'Faroese',
  'Fijian',
  'Filipino',
  'Finnish',
  'Finno-Ugrian languages',
  'Fon',
  'French',
  'French, Middle (ca.1400-1600)',
  'French, Old (842-ca.1400)',
  'Friulian',
  'Fulah',
  'Ga',
  'Gaelic',
  'Galibi Carib',
  'Galician',
  'Ganda',
  'Gayo',
  'Gbaya',
  'Geez',
  'Georgian',
  'German',
  'German, Middle High (ca.1050-1500)',
  'German, Old High (ca.750-1050)',
  'Germanic languages',
  'Gilbertese',
  'Gondi',
  'Gorontalo',
  'Gothic',
  'Grebo',
  'Greek',
  'Greek, Ancient (to 1453)',
  'Guarani',
  'Gujarati',
  "Gwich'in",
  'Haida',
  'Haitian',
  'Hausa',
  'Hawaiian',
  'Hebrew',
  'Herero',
  'Hiligaynon',
  'Himachali languages',
  'Hindi',
  'Hiri Motu',
  'Hittite',
  'Hmong',
  'Hungarian',
  'Hupa',
  'Iban',
  'Icelandic',
  'Ido',
  'Igbo',
  'Ijo languages',
  'Iloko',
  'Inari Sami',
  'Indic languages',
  'Indo-European languages',
  'Indonesian',
  'Ingush',
  'Interlingua',
  'Interlingue',
  'Inuktitut',
  'Inupiaq',
  'Iranian languages',
  'Irish',
  'Irish, Middle (900-1200)',
  'Irish, Old (to 900)',
  'Iroquoian languages',
  'Italian',
  'Japanese',
  'Javanese',
  'Judeo-Arabic',
  'Judeo-Persian',
  'Kabardian',
  'Kabyle',
  'Kachin',
  'Kalaallisut',
  'Kalmyk',
  'Kamba',
  'Kannada',
  'Kanuri',
  'Kara-Kalpak',
  'Karachay-Balkar',
  'Karelian',
  'Karen languages',
  'Kashmiri',
  'Kashubian',
  'Kawi',
  'Kazakh',
  'Khasi',
  'Khoisan languages',
  'Khotanese',
  'Kikuyu',
  'Kimbundu',
  'Kinyarwanda',
  'Kirghiz',
  'Klingon',
  'Komi',
  'Kongo',
  'Konkani',
  'Korean',
  'Kosraean',
  'Kpelle',
  'Kru languages',
  'Kuanyama',
  'Kumyk',
  'Kurdish',
  'Kurukh',
  'Kutenai',
  'Ladino',
  'Lahnda',
  'Lamba',
  'Land Dayak languages',
  'Lao',
  'Latin',
  'Latvian',
  'Lezghian',
  'Limburgan',
  'Lingala',
  'Lithuanian',
  'Lojban',
  'Low German',
  'Lower Sorbian',
  'Lozi',
  'Luba-Katanga',
  'Luba-Lulua',
  'Luiseno',
  'Lule Sami',
  'Lunda',
  'Luo (Kenya and Tanzania)',
  'Lushai',
  'Luxembourgish',
  'Macedonian',
  'Madurese',
  'Magahi',
  'Maithili',
  'Makasar',
  'Malagasy',
  'Malay',
  'Malayalam',
  'Maltese',
  'Manchu',
  'Mandar',
  'Mandingo',
  'Manipuri',
  'Manobo languages',
  'Manx',
  'Maori',
  'Mapudungun',
  'Marathi',
  'Mari',
  'Marshallese',
  'Marwari',
  'Masai',
  'Mayan languages',
  'Mende',
  "Mi'kmaq",
  'Minangkabau',
  'Mirandese',
  'Mohawk',
  'Moksha',
  'Mon-Khmer languages',
  'Mongo',
  'Mongolian',
  'Montenegrin',
  'Mossi',
  'Multiple languages',
  'Munda languages',
  "N'Ko",
  'Nahuatl languages',
  'Nauru',
  'Navajo',
  'Ndonga',
  'Neapolitan',
  'Nepal Bhasa',
  'Nepali',
  'Nias',
  'Niger-Kordofanian languages',
  'Nilo-Saharan languages',
  'Niuean',
  'No linguistic content',
  'Nogai',
  'Norse, Old',
  'North American Indian languages',
  'North Ndebele',
  'Northern Frisian',
  'Northern Sami',
  'Norwegian',
  'Norwegian Bokmål',
  'Norwegian Nynorsk',
  'Nubian languages',
  'Nyamwezi',
  'Nyankole',
  'Nyoro',
  'Nzima',
  'Occitan (post 1500)',
  'Official Aramaic (700-300 BCE)',
  'Ojibwa',
  'Oriya',
  'Oromo',
  'Osage',
  'Ossetian',
  'Otomian languages',
  'Pahlavi',
  'Palauan',
  'Pali',
  'Pampanga',
  'Pangasinan',
  'Panjabi',
  'Papiamento',
  'Papuan languages',
  'Pedi',
  'Persian',
  'Persian, Old (ca.600-400 B.C.)',
  'Philippine languages',
  'Phoenician',
  'Pohnpeian',
  'Polish',
  'Portuguese',
  'Prakrit languages',
  'Provençal, Old (to 1500)',
  'Pushto',
  'Quechua',
  'Rajasthani',
  'Rapanui',
  'Rarotongan',
  'Romance languages',
  'Romanian',
  'Romansh',
  'Romany',
  'Rundi',
  'Russian',
  'Salishan languages',
  'Samaritan Aramaic',
  'Sami languages',
  'Samoan',
  'Sandawe',
  'Sango',
  'Sanskrit',
  'Santali',
  'Sardinian',
  'Sasak',
  'Scots',
  'Selkup',
  'Semitic languages',
  'Serbian',
  'Serer',
  'Shan',
  'Shona',
  'Sichuan Yi',
  'Sicilian',
  'Sidamo',
  'Sign Languages',
  'Siksika',
  'Sindhi',
  'Sinhala',
  'Sino-Tibetan languages',
  'Siouan languages',
  'Skolt Sami',
  'Slave (Athapascan)',
  'Slavic languages',
  'Slovak',
  'Slovenian',
  'Sogdian',
  'Somali',
  'Songhai languages',
  'Soninke',
  'Sorbian languages',
  'Sotho, Southern',
  'South American Indian languages',
  'South Ndebele',
  'Southern Altai',
  'Southern Sami',
  'Spanish',
  'Sranan Tongo',
  'Standard Moroccan Tamazight',
  'Sukuma',
  'Sumerian',
  'Sundanese',
  'Susu',
  'Swahili',
  'Swati',
  'Swedish',
  'Swiss German',
  'Syriac',
  'Tagalog',
  'Tahitian',
  'Tai languages',
  'Tajik',
  'Tamashek',
  'Tamil',
  'Tatar',
  'Telugu',
  'Tereno',
  'Tetum',
  'Thai',
  'Tibetan',
  'Tigre',
  'Tigrinya',
  'Timne',
  'Tiv',
  'Tlicho',
  'Tlingit',
  'Tok Pisin',
  'Tokelau',
  'Tonga (Nyasa)',
  'Tonga (Tonga Islands)',
  'Tsimshian',
  'Tsonga',
  'Tswana',
  'Tumbuka',
  'Tupi languages',
  'Turkish',
  'Turkish, Ottoman (1500-1928)',
  'Turkmen',
  'Tuvalu',
  'Tuvinian',
  'Twi',
  'Udmurt',
  'Ugaritic',
  'Uighur',
  'Ukrainian',
  'Umbundu',
  'Uncoded languages',
  'Undetermined',
  'Upper Sorbian',
  'Urdu',
  'Uzbek',
  'Vai',
  'Venda',
  'Vietnamese',
  'Volapük',
  'Votic',
  'Wakashan languages',
  'Walloon',
  'Waray',
  'Washo',
  'Welsh',
  'Western Frisian',
  'Wolaitta',
  'Wolof',
  'Xhosa',
  'Yakut',
  'Yao',
  'Yapese',
  'Yiddish',
  'Yoruba',
  'Yupik languages',
  'Zande languages',
  'Zapotec',
  'Zaza',
  'Zenaga',
  'Zhuang',
  'Zulu',
  'Zuni',
];

const LabelWithTooltip = ({ label, tooltip }: { label: string; tooltip: string }) => {
  return (
    <Tooltip title={tooltip}>
      <span style={{ textDecoration: 'underline dotted' }}>{label}</span>
    </Tooltip>
  );
};

interface RunOptionsProps {
  numTests: number | undefined;
  runOptions?: Partial<RedteamRunOptions>;
  updateConfig: (section: keyof Config, value: any) => void;
  updateRunOption: (key: keyof RedteamRunOptions, value: any) => void;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
  language?: string | string[];
}

export interface NumberOfTestCasesInputProps {
  value: string;
  setValue: (value: string) => void;
  updateConfig: (section: keyof Config, value: any) => void;
  readOnly?: boolean;
  defaultNumberOfTests?: number;
}

const isBelowMin = (value: string, min: number) => {
  if (value === '') {
    return false;
  }
  const n = Number(value);
  return Number.isNaN(n) || n < min;
};

/**
 * Number of test cases
 * - Accepts only digits as the user types (temporary empty state allowed)
 * - onBlur clamps to a minimum of 1 and persists via updateConfig
 * - Prevents non-numeric characters like e/E/+/−/.
 */
export const NumberOfTestCasesInput = ({
  value,
  setValue,
  updateConfig,
  readOnly,
  defaultNumberOfTests = REDTEAM_DEFAULTS.NUM_TESTS,
}: NumberOfTestCasesInputProps) => {
  const error = isBelowMin(value, 1) ? RUNOPTIONS_TEXT.numberOfTests.error : undefined;
  return (
    <BaseNumberInput
      fullWidth
      label="Number of test cases"
      value={value}
      min={1}
      onChange={(v) => {
        setValue(v?.toString() || '');
      }}
      onBlur={() => {
        if (readOnly) {
          return;
        }
        if (value === '') {
          updateConfig('numTests', defaultNumberOfTests);
          setValue(defaultNumberOfTests.toString());
          return;
        }
        const parsed = Number(value);
        const safe = Number.isNaN(parsed) || parsed < 1 ? defaultNumberOfTests : parsed;
        updateConfig('numTests', safe);
        setValue(String(safe));
      }}
      slotProps={{
        input: { readOnly },
      }}
      helperText={error ? error : RUNOPTIONS_TEXT.numberOfTests.helper}
      error={Boolean(error)}
    />
  );
};

export interface DelayBetweenAPICallsInputProps {
  value: string;
  setValue: (value: string) => void;
  updateRunOption: (key: keyof RedteamRunOptions, value: any) => void;
  readOnly?: boolean;
  canSetDelay?: boolean;
  setMaxConcurrencyValue: (value: string) => void;
}

/**
 * Delay between API calls (ms)
 * - Enabled only when maxConcurrency is 1 (mutual exclusivity rule)
 * - Accepts only digits; onBlur clamps to ≥ 0 and persists via updateRunOption
 * - If delay > 0, we force maxConcurrency to 1 to uphold exclusivity
 * - Prevents non-numeric characters like e/E/+/−/.
 */
export const DelayBetweenAPICallsInput = ({
  canSetDelay,
  readOnly,
  setValue,
  setMaxConcurrencyValue,
  updateRunOption,
  value,
}: DelayBetweenAPICallsInputProps) => {
  const error = isBelowMin(value, 0) ? RUNOPTIONS_TEXT.delayBetweenApiCalls.error : undefined;
  return (
    <BaseNumberInput
      fullWidth
      label={
        canSetDelay ? (
          'Delay between API calls (ms)'
        ) : (
          <LabelWithTooltip
            label="Delay between API calls (ms)"
            tooltip="To set a delay, you must set the number of concurrent requests to 1."
          />
        )
      }
      value={value}
      disabled={!canSetDelay || readOnly}
      onChange={(v) => {
        if (readOnly) {
          return;
        }
        setValue(v?.toString() || '');
      }}
      onBlur={() => {
        if (readOnly) {
          return;
        }
        const parsed = value === '' ? 0 : Number(value);
        const safe = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
        updateRunOption('delay', safe);
        setValue(String(safe));
        // Enforce mutual exclusivity
        updateRunOption('maxConcurrency', 1);
        setMaxConcurrencyValue('1');
      }}
      min={0}
      slotProps={{
        input: {
          readOnly,
          endAdornment: (
            <Box sx={{ pl: 1 }}>
              <Typography variant="caption">ms</Typography>
            </Box>
          ),
        },
      }}
      helperText={error || RUNOPTIONS_TEXT.delayBetweenApiCalls.helper}
      error={Boolean(error)}
    />
  );
};

export interface MaxNumberOfConcurrentRequestsInputProps {
  value: string;
  setValue: (value: string) => void;
  setDelayValue: (value: string) => void;
  updateRunOption: (key: keyof RedteamRunOptions, value: any) => void;
  readOnly?: boolean;
  canSetMaxConcurrency?: boolean;
}

export const MaxNumberOfConcurrentRequestsInput = ({
  value,
  setValue,
  setDelayValue,
  updateRunOption,
  readOnly,
  canSetMaxConcurrency,
}: MaxNumberOfConcurrentRequestsInputProps) => {
  const error = isBelowMin(value, 1) ? RUNOPTIONS_TEXT.maxConcurrentRequests.error : undefined;
  return (
    <BaseNumberInput
      fullWidth
      label={
        canSetMaxConcurrency ? (
          'Max number of concurrent requests'
        ) : (
          <LabelWithTooltip
            label="Max number of concurrent requests"
            tooltip="To set a max concurrency, you must set the delay to 0."
          />
        )
      }
      value={value}
      disabled={!canSetMaxConcurrency || readOnly}
      onChange={(v) => {
        if (readOnly) {
          return;
        }
        setValue(v?.toString() || '');
      }}
      min={1}
      onBlur={() => {
        if (readOnly) {
          return;
        }
        const parsed = value === '' ? 1 : Number(value);
        const safe = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
        updateRunOption('maxConcurrency', safe);
        setValue(String(safe));
        // Enforce mutual exclusivity
        updateRunOption('delay', 0);
        setDelayValue('0');
      }}
      slotProps={{
        input: {
          readOnly,
          endAdornment: (
            <Box sx={{ pl: 1 }}>
              <Typography variant="caption">requests</Typography>
            </Box>
          ),
        },
      }}
      helperText={error || RUNOPTIONS_TEXT.maxConcurrentRequests.helper}
      error={Boolean(error)}
    />
  );
};

export const RunOptionsContent = ({
  numTests,
  runOptions,
  updateConfig,
  updateRunOption,
  language,
}: RunOptionsProps) => {
  // These two settings are mutually exclusive
  const canSetDelay = Boolean(!runOptions?.maxConcurrency || runOptions?.maxConcurrency === 1);

  const canSetMaxConcurrency = Boolean(!runOptions?.delay || runOptions?.delay === 0);

  const [numTestsInput, setNumTestsInput] = useState<string>(
    numTests !== undefined ? String(numTests) : '0',
  );
  const [delayInput, setDelayInput] = useState<string>(
    runOptions?.delay !== undefined ? String(runOptions.delay) : '0',
  );
  const [maxConcurrencyInput, setMaxConcurrencyInput] = useState<string>(
    runOptions?.maxConcurrency !== undefined ? String(runOptions.maxConcurrency) : '1',
  );

  // Normalize language to array for Autocomplete
  const languageArray = useMemo<string[]>(() => {
    if (!language) {
      return [];
    }
    return Array.isArray(language) ? language : [language];
  }, [language]);

  // Handler for language changes
  const handleLanguageChange = useCallback(
    (_event: unknown, newValue: string[]) => {
      updateConfig('language', newValue.length > 0 ? newValue : undefined);
    },
    [updateConfig],
  );

  return (
    <Stack spacing={3}>
      <NumberOfTestCasesInput
        value={numTestsInput}
        setValue={setNumTestsInput}
        updateConfig={updateConfig}
      />

      <DelayBetweenAPICallsInput
        value={delayInput}
        setValue={setDelayInput}
        updateRunOption={updateRunOption}
        readOnly={!canSetDelay}
        canSetDelay={canSetDelay}
        setMaxConcurrencyValue={setMaxConcurrencyInput}
      />
      {/**
       * Max number of concurrent requests
       * - Enabled only when delay is 0 (mutual exclusivity rule)
       * - Accepts only digits; onBlur clamps to ≥ 1 and persists via updateRunOption
       * - Any change forces delay to 0 to uphold exclusivity
       * - Prevents non-numeric characters like e/E/+/−/.
       */}
      <MaxNumberOfConcurrentRequestsInput
        value={maxConcurrencyInput}
        setValue={setMaxConcurrencyInput}
        updateRunOption={updateRunOption}
        readOnly={!canSetMaxConcurrency}
        canSetMaxConcurrency={canSetMaxConcurrency}
        setDelayValue={setDelayInput}
      />
      <FormControlLabel
        control={
          <Switch
            checked={runOptions?.verbose}
            onChange={(e) => updateRunOption('verbose', e.target.checked)}
          />
        }
        label={
          <Box>
            <Typography variant="body1">Debug mode</Typography>
            <Typography variant="body2" color="text.secondary">
              Show additional debug information in logs
            </Typography>
          </Box>
        }
      />
      <Autocomplete
        multiple
        freeSolo
        options={COMMON_LANGUAGES}
        value={languageArray}
        onChange={handleLanguageChange}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return <Chip key={key} label={option} {...tagProps} />;
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={RUNOPTIONS_TEXT.languages.label}
            placeholder="Type and press Enter to add a language"
            helperText={RUNOPTIONS_TEXT.languages.helper}
          />
        )}
      />
    </Stack>
  );
};
