import { BacklogItem } from '../types';

export const CANONICAL_BACKLOG_BATCH_ID = 'BLB-CLEARED-RESET';
export const CANONICAL_BACKLOG_FILE_NAME = '';
export const CANONICAL_BACKLOG_UPLOAD_DATE = '';

interface RawBacklogSeedDef {
  srNo: number;
  mach: string;
  size: string;
  deptCode: string;
  deptName: string;
  op: string;
  qty: number;
  due: string;
  prio: string;
  unmapped?: boolean;
}

// All previous hardcoded/sample backlog records permanently cleared
const RAW_BACKLOG_RECORDS: RawBacklogSeedDef[] = [];

/**
 * Returns empty array. All backlog records must originate from genuine Excel uploads or direct entries.
 */
export function generateCanonicalBacklogItems(): BacklogItem[] {
  return [];
}
