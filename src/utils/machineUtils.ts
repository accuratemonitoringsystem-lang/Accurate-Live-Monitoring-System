/**
 * Standard Machine Data Mapping & Normalization Utilities
 * Ensures consistent resolution of Machine Size, normalized Machine Number, and Month/Year.
 */

export interface MachineLike {
  machineNumber?: string;
  machineSize?: string;
  machineModel?: string;
  model?: string;
  modelSize?: string;
  specification?: string;
  size?: string;
  cmmSize?: string;
  cmmModel?: string;
  [key: string]: any;
}

/**
 * Returns canonical, non-empty Machine Size.
 * Resolves across all possible schema variations: machineSize, machineModel, model, modelSize, specification, size, cmmSize.
 * Returns 'Size not available' if none is found.
 */
export function getMachineDisplaySize(item: MachineLike | null | undefined): string {
  if (!item) return 'Size not available';
  const val =
    item.machineSize ||
    item.machineModel ||
    item.model ||
    item.modelSize ||
    item.specification ||
    item.size ||
    item.cmmSize ||
    item.cmmModel;

  if (typeof val !== 'string' || !val.trim() || val.trim().toLowerCase() === 'standard' || val.trim() === '-') {
    return 'Size not available';
  }
  return val.trim();
}

/**
 * Formats a clean display label for machine dropdowns and headers:
 * e.g., "2571 — 564" or "2575 — 10208"
 */
export function formatMachineLabel(item: MachineLike | null | undefined): string {
  if (!item) return '-';
  const num = String(item.machineNumber || '').trim();
  const size = getMachineDisplaySize(item);
  if (!num) return size;
  return `${num} — ${size}`;
}

/**
 * Normalizes machine number while preserving display value and leading zeros.
 */
export function normalizeMachineNumber(machineNumber: string | number | null | undefined): string {
  if (machineNumber === null || machineNumber === undefined) return '';
  return String(machineNumber).trim();
}

/**
 * Robust equality check between two machine numbers.
 * Matches even if one has prefix like 'MACH-' or 'CMM-' while preserving leading zeros comparison.
 */
export function areMachineNumbersEqual(a?: string | number | null, b?: string | number | null): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const sA = String(a).trim();
  const sB = String(b).trim();
  if (sA.toLowerCase() === sB.toLowerCase()) return true;

  const cleanA = sA.replace(/^(MACH|CMM)[-_ ]*/i, '').trim();
  const cleanB = sB.replace(/^(MACH|CMM)[-_ ]*/i, '').trim();
  return cleanA.toLowerCase() === cleanB.toLowerCase();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_LOOKUP: Record<string, string> = {
  '1': 'January', '01': 'January', 'jan': 'January', 'january': 'January',
  '2': 'February', '02': 'February', 'feb': 'February', 'february': 'February',
  '3': 'March', '03': 'March', 'mar': 'March', 'march': 'March',
  '4': 'April', '04': 'April', 'apr': 'April', 'april': 'April',
  '5': 'May', '05': 'May',
  '6': 'June', '06': 'June', 'jun': 'June', 'june': 'June',
  '7': 'July', '07': 'July', 'jul': 'July', 'july': 'July',
  '8': 'August', '08': 'August', 'aug': 'August', 'august': 'August',
  '9': 'September', '09': 'September', 'sep': 'September', 'september': 'September',
  '10': 'October', 'oct': 'October', 'october': 'October',
  '11': 'November', 'nov': 'November', 'november': 'November',
  '12': 'December', 'dec': 'December', 'december': 'December',
};

/**
 * Cleans month and year strings so "October 2026", "10", "2026-10", etc. resolve accurately to standardized { month: 'October', year: '2026' }.
 */
export function cleanMonthYear(monthStr?: string | number, yearStr?: string | number): { month: string; year: string } {
  let currentYr = String(yearStr || new Date().getFullYear()).trim();
  if (!monthStr) return { month: 'October', year: currentYr };

  const raw = String(monthStr).trim();

  // Check if raw contains 4-digit year like "October 2026", "2026-10", "10/2026", "2026/10"
  const yrMatch = raw.match(/\b(20\d{2})\b/);
  if (yrMatch) {
    currentYr = yrMatch[1];
  }

  // Extract month token by splitting on space, dash, slash, underscore
  const tokens = raw.replace(/\b20\d{2}\b/g, '').split(/[\s\-_/]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const candidate = tokens[0] || '';

  let resolvedMonth = 'October';
  if (MONTH_LOOKUP[candidate]) {
    resolvedMonth = MONTH_LOOKUP[candidate];
  } else {
    // Check partial match
    const matched = MONTH_NAMES.find((m) => m.toLowerCase().startsWith(candidate) || candidate.startsWith(m.toLowerCase()));
    if (matched) {
      resolvedMonth = matched;
    } else {
      resolvedMonth = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  return { month: resolvedMonth, year: currentYr };
}

/**
 * Returns a standardized "Month Year" label: e.g., "October 2026"
 */
export function formatMonthYearLabel(monthStr?: string | number, yearStr?: string | number): string {
  const { month, year } = cleanMonthYear(monthStr, yearStr);
  return `${month} ${year}`;
}
