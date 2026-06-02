import {
  ENERGY_PUC_PLUGINS as ENERGY_PUC_PLUGIN_IDS,
  type Plugin,
} from '@promptfoo/redteam/constants';

export const ENERGY_PUC_PLUGINS: ReadonlySet<Plugin> = new Set(ENERGY_PUC_PLUGIN_IDS);

export const ENERGY_PUC_MARKETS = [
  { value: 'ar-psc', label: 'AR PSC', isoFootprintLabel: 'MISO footprint' },
  { value: 'ca-cpuc', label: 'CA CPUC', isoFootprintLabel: 'CAISO footprint' },
  { value: 'ct-pura', label: 'CT PURA', isoFootprintLabel: 'ISO-NE footprint' },
  { value: 'dc-psc', label: 'DC PSC', isoFootprintLabel: 'PJM footprint' },
  { value: 'de-psc', label: 'DE PSC', isoFootprintLabel: 'PJM footprint' },
  { value: 'il-icc', label: 'IL ICC', isoFootprintLabel: 'PJM / MISO footprints' },
  { value: 'ia-iuc', label: 'IA IUC', isoFootprintLabel: 'MISO footprint' },
  { value: 'in-iurc', label: 'IN IURC', isoFootprintLabel: 'PJM / MISO footprints' },
  { value: 'ks-kcc', label: 'KS KCC', isoFootprintLabel: 'SPP footprint' },
  { value: 'ky-psc', label: 'KY PSC', isoFootprintLabel: 'PJM / MISO footprints' },
  { value: 'ma-dpu', label: 'MA DPU', isoFootprintLabel: 'ISO-NE footprint' },
  { value: 'me-puc', label: 'ME PUC', isoFootprintLabel: 'ISO-NE footprint' },
  { value: 'md-psc', label: 'MD PSC', isoFootprintLabel: 'PJM footprint' },
  { value: 'mi-mpsc', label: 'MI MPSC', isoFootprintLabel: 'MISO / PJM footprints' },
  { value: 'mn-puc', label: 'MN PUC', isoFootprintLabel: 'MISO footprint' },
  { value: 'mo-psc', label: 'MO PSC', isoFootprintLabel: 'MISO footprint' },
  { value: 'ms-psc', label: 'MS PSC', isoFootprintLabel: 'MISO footprint' },
  { value: 'mt-psc', label: 'MT PSC', isoFootprintLabel: 'SPP footprint' },
  { value: 'nd-psc', label: 'ND PSC', isoFootprintLabel: 'SPP footprint' },
  { value: 'ne-psc', label: 'NE PSC', isoFootprintLabel: 'SPP footprint' },
  { value: 'nm-prc', label: 'NM PRC', isoFootprintLabel: 'SPP footprint' },
  { value: 'nc-uc', label: 'NC UC', isoFootprintLabel: 'PJM footprint' },
  { value: 'nh-doe', label: 'NH DOE', isoFootprintLabel: 'ISO-NE footprint' },
  { value: 'nj-bpu', label: 'NJ BPU', isoFootprintLabel: 'PJM footprint' },
  { value: 'ny-dps', label: 'NY DPS', isoFootprintLabel: 'NYISO footprint' },
  { value: 'ok-cc', label: 'OK CC', isoFootprintLabel: 'SPP footprint' },
  { value: 'oh-puco', label: 'OH PUCO', isoFootprintLabel: 'PJM footprint' },
  { value: 'pa-puc', label: 'PA PUC', isoFootprintLabel: 'PJM footprint' },
  { value: 'ri-dpuc', label: 'RI DPUC', isoFootprintLabel: 'ISO-NE footprint' },
  { value: 'sd-puc', label: 'SD PUC', isoFootprintLabel: 'SPP footprint' },
  { value: 'tn-tpuc', label: 'TN TPUC', isoFootprintLabel: 'PJM footprint' },
  { value: 'tx-puct', label: 'TX PUCT', isoFootprintLabel: 'ERCOT footprint' },
  { value: 'va-scc', label: 'VA SCC', isoFootprintLabel: 'PJM footprint' },
  { value: 'vt-puc', label: 'VT PUC', isoFootprintLabel: 'ISO-NE footprint' },
  { value: 'wi-psc', label: 'WI PSC', isoFootprintLabel: 'MISO footprint' },
  { value: 'wv-psc', label: 'WV PSC', isoFootprintLabel: 'PJM footprint' },
  { value: 'wy-psc', label: 'WY PSC', isoFootprintLabel: 'SPP footprint' },
] as const;

export const ENERGY_PUC_MARKET_ACTOR_TYPES = [
  { value: 'utility', label: 'Utility' },
  { value: 'esco', label: 'ESCO' },
  { value: 'rep', label: 'REP' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'cca', label: 'CCA' },
] as const;

export type EnergyPucMarketActorType = (typeof ENERGY_PUC_MARKET_ACTOR_TYPES)[number]['value'];

export type EnergyPucMarketSelection = {
  market: string;
  marketActorType?: EnergyPucMarketActorType;
};

export const getEnergyPucActorTypeLabel = (actorType: EnergyPucMarketActorType): string =>
  ENERGY_PUC_MARKET_ACTOR_TYPES.find((option) => option.value === actorType)?.label ?? actorType;

const PAYMENT_PLAN_UTILITY_MARKETS = new Set([
  'ar-psc',
  'ca-cpuc',
  'ct-pura',
  'dc-psc',
  'de-psc',
  'ia-iuc',
  'il-icc',
  'in-iurc',
  'ks-kcc',
  'ky-psc',
  'ma-dpu',
  'me-puc',
  'mi-mpsc',
  'mn-puc',
  'mo-psc',
  'ms-psc',
  'mt-psc',
  'nc-uc',
  'nd-psc',
  'ne-psc',
  'nh-doe',
  'nj-bpu',
  'nm-prc',
  'oh-puco',
  'ok-cc',
  'ri-dpuc',
  'sd-puc',
  'tn-tpuc',
  'va-scc',
  'vt-puc',
  'wi-psc',
  'wv-psc',
  'wy-psc',
]);

const normalizeActorType = (value: unknown): EnergyPucMarketActorType | undefined =>
  ENERGY_PUC_MARKET_ACTOR_TYPES.some((actorType) => actorType.value === value)
    ? (value as EnergyPucMarketActorType)
    : undefined;

export const isEnergyPucPlugin = (plugin: string): plugin is Plugin =>
  ENERGY_PUC_PLUGINS.has(plugin as Plugin);

export const getAllowedEnergyPucActorTypes = (
  plugin: Plugin,
  market: string,
): EnergyPucMarketActorType[] => {
  switch (plugin) {
    case 'energy:puc-fixed-rate-benchmark-cap':
    case 'energy:puc-product-scope-integrity':
      return market === 'ny-dps' || market === 'pa-puc' ? ['esco', 'supplier'] : [];
    case 'energy:puc-medical-baseline-integrity':
      return market === 'ca-cpuc' ? ['utility'] : [];
    case 'energy:puc-offer-eligibility-gate':
      if (market === 'ny-dps' || market === 'pa-puc') {
        return ['esco', 'supplier'];
      }
      return market === 'md-psc' ? ['supplier'] : [];
    case 'energy:puc-payment-plan-service-restoration-integrity':
      if (market === 'tx-puct') {
        return ['rep'];
      }
      if (market === 'dc-psc') {
        return ['utility', 'supplier'];
      }
      return PAYMENT_PLAN_UTILITY_MARKETS.has(market) ? ['utility'] : [];
    case 'energy:puc-variable-rate-savings-protection':
      return market === 'ny-dps' ? ['esco', 'supplier'] : [];
    default:
      return [];
  }
};

export const getDefaultEnergyPucActorType = (
  plugin: Plugin,
  market: string,
): EnergyPucMarketActorType | undefined => getAllowedEnergyPucActorTypes(plugin, market)[0];

export const getEnergyPucMarketSelections = (
  config?: Record<string, unknown>,
): EnergyPucMarketSelection[] => {
  const selections = Array.isArray(config?.marketSelections)
    ? config.marketSelections
        .filter(
          (selection): selection is Record<string, unknown> =>
            typeof selection === 'object' && selection !== null,
        )
        .map((selection) => ({
          market: typeof selection.market === 'string' ? selection.market : '',
          marketActorType: normalizeActorType(selection.marketActorType),
        }))
        .filter((selection) => selection.market.trim() !== '')
    : [];

  if (selections.length > 0) {
    return selections;
  }

  const fallbackActorType = normalizeActorType(config?.marketActorType);
  if (Array.isArray(config?.markets)) {
    return config.markets
      .filter((market): market is string => typeof market === 'string' && market.trim() !== '')
      .map((market) => ({ market, marketActorType: fallbackActorType }));
  }

  if (typeof config?.market === 'string' && config.market.trim() !== '') {
    return [{ market: config.market, marketActorType: fallbackActorType }];
  }

  return [];
};

export const getEnergyPucMarkets = (config?: Record<string, unknown>): string[] =>
  getEnergyPucMarketSelections(config).map((selection) => selection.market);

export const normalizeEnergyPucMarketSelections = (
  plugin: Plugin,
  config?: Record<string, unknown>,
): EnergyPucMarketSelection[] =>
  getEnergyPucMarketSelections(config).map((selection) => ({
    market: selection.market,
    marketActorType:
      selection.marketActorType ?? getDefaultEnergyPucActorType(plugin, selection.market),
  }));

export const mergeEnergyPucMarketSelections = (
  ...selectionGroups: EnergyPucMarketSelection[][]
): EnergyPucMarketSelection[] => {
  const selectionsByMarket = new Map<string, EnergyPucMarketSelection>();

  for (const selections of selectionGroups) {
    for (const selection of selections) {
      selectionsByMarket.set(selection.market, selection);
    }
  }

  return Array.from(selectionsByMarket.values());
};

export const isValidEnergyPucConfig = (
  plugin: Plugin,
  config?: Record<string, unknown>,
): boolean => {
  const selections = normalizeEnergyPucMarketSelections(plugin, config);
  return (
    selections.length > 0 &&
    selections.every((selection) => {
      if (!selection.marketActorType) {
        return false;
      }
      return getAllowedEnergyPucActorTypes(plugin, selection.market).includes(
        selection.marketActorType,
      );
    })
  );
};
