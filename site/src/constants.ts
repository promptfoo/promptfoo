import generatedStats from './.generated-stats.json';
import siteStats from './site-stats.json';

export const SITE_CONSTANTS = { ...siteStats, ...generatedStats };
