interface VegasBoothHours {
  readonly date: string;
  readonly day: string;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly note?: string;
}

export const BLACK_HAT_BOOTH_HOURS: readonly VegasBoothHours[] = [
  {
    date: '2026-08-04',
    day: 'Tue Aug 4',
    opensAt: '4:00pm',
    closesAt: '7:00pm',
    note: 'Business Hall Welcome Reception',
  },
  {
    date: '2026-08-05',
    day: 'Wed Aug 5',
    opensAt: '9:00am',
    closesAt: '6:00pm',
    note: 'Hall-wide Booth Crawl, 4:00pm to 5:00pm',
  },
  {
    date: '2026-08-06',
    day: 'Thu Aug 6',
    opensAt: '9:00am',
    closesAt: '4:00pm',
  },
];

export const DEF_CON_BOOTH_HOURS: readonly VegasBoothHours[] = [
  {
    date: '2026-08-07',
    day: 'Fri Aug 7',
    opensAt: '10:00am',
    closesAt: '6:00pm',
  },
  {
    date: '2026-08-08',
    day: 'Sat Aug 8',
    opensAt: '10:00am',
    closesAt: '6:00pm',
  },
  {
    date: '2026-08-09',
    day: 'Sun Aug 9',
    opensAt: '10:00am',
    closesAt: '4:00pm',
  },
];
