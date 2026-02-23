export const getDate = (date: number | string | Date): Date => new Date(date);

export const getDateFromRusFormat = (date: string) => {
  const dateParts = date.split('.');
  return new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
};

export const parseDaysToMs = (days: number): number => {
  return days * 24 * 60 * 60 * 1000;
};

export const parseMsToDays = (ms: number): number => {
  return ms / 1000 / 60 / 60 / 24;
};
