import { Department } from './types';

export const COMPANY_NAME = 'ACCURATE GAUGING AND INSTRUMENTS PVT LTD';
export const SYSTEM_SUBTITLE = 'Manufacturing Planning & Monitoring System';

export const INITIAL_DEPARTMENTS: Department[] = [
  { code: '01', id: 'DESIGN', name: '01 Design', order: 1, active: true },
  { code: '02', id: 'PLANNING', name: '02 Planning', order: 2, active: true },
  { code: '03', id: '03_PURCHASE', name: '03 Purchase', order: 3, active: true },
  { code: '04', id: '04_INWARD_QUALITY', name: '04 Inward Quality', order: 4, active: true },
  { code: '05', id: '05_STORE', name: '05 Store', order: 5, active: true },
  { code: '06-A', id: '06A_METAL_SHOP', name: '06-A Metal Shop', order: 6, active: true },
  { code: '06-B', id: '06B_GRANITE_SHOP', name: '06-B Granite Shop', order: 7, active: true },
  { code: '07A', id: '07A_LAPPING_FLATNESS_INSERT', name: '07A-Lapping-Flatness & Insert Fitment', order: 8, active: true },
  { code: '07B', id: '07B_LAPPING_Y3_SLOT', name: '07B-Lapping-Y3 & Slot', order: 9, active: true },
  { code: '07C', id: '07C_LAPPING_RTLT_TOP_BOTTOM', name: '07C-Lapping-RTLT & Top Bottom', order: 10, active: true },
  { code: '08', id: '08_SUB_ASSEMBLY', name: '08 Sub Assembly', order: 11, active: true },
  { code: '09', id: '09_GUARD_FITMENT', name: '09 Guard Fitment', order: 12, active: true },
  { code: '10-A', id: '10A_PAINT_SHOP_A_CLASS', name: '10-A Paint Shop-A Class Item', order: 13, active: true },
  { code: '10-B', id: '10B_PAINT_SHOP_GUARD_SET', name: '10-B Paint Shop-Guard Set', order: 14, active: true },
  { code: '11-A', id: '11A_ELECTRONICS_CABLE_SET', name: '11-A Electronics-Cable Set', order: 15, active: true },
  { code: '11-B', id: '11B_ELECTRONICS_TUNING', name: '11-B Electronics-Tuning', order: 16, active: true },
  { code: '12', id: '12_ASSEMBLY', name: '12 Assembly', order: 17, active: true },
  { code: '12-BRIDGE', id: '12_BRIDGE_ASSEMBLY', name: '12 Bridge Assembly', order: 18, active: true },
  { code: '13', id: '13_IT_COMPUTER_INSPECTION', name: '13 IT-Computer Inspection', order: 19, active: true },
  { code: '14', id: '14_CALIBRATION', name: '14 Calibration', order: 20, active: true },
  { code: '15', id: '15_PACKING', name: '15 Packing', order: 21, active: true },
];

export const PRODUCTION_DEPARTMENTS = INITIAL_DEPARTMENTS.filter(
  (d) => d.code !== '01' && !d.name.toLowerCase().includes('design')
);

export interface MonthlyPlanDeptDef {
  code: string;
  name: string;
  label: string;
  group: 'GROUP_1' | 'GROUP_2';
  aliases: string[];
}

export const MONTHLY_PLAN_GROUP_1_DEPTS: MonthlyPlanDeptDef[] = [
  { code: '02', name: '02 Planning', label: 'Planning', group: 'GROUP_1', aliases: ['02', 'planning', '02 planning'] },
  { code: '03', name: '03 Purchase', label: 'Purchase', group: 'GROUP_1', aliases: ['03', 'purchase', '03 purchase'] },
  { code: '04', name: '04 Inward Quality', label: 'Inward Quality', group: 'GROUP_1', aliases: ['04', 'inward quality', 'quality', '04 inward quality', 'qa'] },
  { code: '05', name: '05 Store', label: 'Store', group: 'GROUP_1', aliases: ['05', 'store', '05 store'] },
  { code: '06-A', name: '06-A Metal Shop', label: 'Metal Shop', group: 'GROUP_1', aliases: ['06-a', '06a', 'metal shop', '06-a metal shop', 'metal'] },
  { code: '06-B', name: '06-B Granite Semi Finish', label: 'Granite Semi Finish', group: 'GROUP_1', aliases: ['06-b', '06b', 'granite semi finish', 'granite shop', '06-b granite shop', 'granite'] },
  { code: '07-A', name: '07-A Lapping – Flatness & Insert Fitment', label: 'Lapping – Flatness & Insert Fitment', group: 'GROUP_1', aliases: ['07-a', '07a', '07a-lapping-flatness & insert fitment', 'lapping-flatness', 'flatness', 'insert fitment'] },
  { code: '07-B', name: '07-B Lapping – Y3 & Slot', label: 'Lapping – Y3 & Slot', group: 'GROUP_1', aliases: ['07-b', '07b', '07b-lapping-y3 & slot', 'lapping-y3', 'y3', 'slot'] },
  { code: '07-C', name: '07-C Lapping – RTLT & Top Bottom', label: 'Lapping – RTLT & Top Bottom', group: 'GROUP_1', aliases: ['07-c', '07c', '07c-lapping-rtlt & top bottom', 'lapping-rtlt', 'rtlt', 'top bottom'] },
  { code: '08', name: '08 Sub Assembly', label: 'Sub Assembly', group: 'GROUP_1', aliases: ['08', 'sub assembly', '08 sub assembly', 'subassembly'] },
  { code: '09', name: '09 Guard Fitment', label: 'Guard Fitment', group: 'GROUP_1', aliases: ['09', 'guard fitment', '09 guard fitment', 'guard'] },
  { code: '10-A', name: '10-A Paint Shop – A Class', label: 'Paint Shop – A Class', group: 'GROUP_1', aliases: ['10-a', '10a', 'paint shop-a class item', 'paint shop - a class', 'paint-a', 'a class'] },
  { code: '10-B', name: '10-B Paint Shop – Guard', label: 'Paint Shop – Guard', group: 'GROUP_1', aliases: ['10-b', '10b', 'paint shop-guard set', 'paint shop - guard', 'paint-g', 'guard set'] },
  { code: '11-A', name: '11-A Electronics – Cable Set', label: 'Electronics – Cable Set', group: 'GROUP_1', aliases: ['11-a', '11a', 'electronics-cable set', 'electronics - cable set', 'cable set'] },
];

export const MONTHLY_PLAN_GROUP_2_DEPTS: MonthlyPlanDeptDef[] = [
  { code: '11-B', name: '11-B Electronics – Tuning', label: 'Electronics – Tuning', group: 'GROUP_2', aliases: ['11-b', '11b', 'electronics-tuning', 'electronics - tuning', 'tuning'] },
  { code: '12-A', name: '12-A Bridge Assembly', label: 'Bridge Assembly', group: 'GROUP_2', aliases: ['12-a', '12a', '12 bridge assembly', 'bridge assembly', 'bridge'] },
  { code: '12-B', name: '12-B Final Assembly', label: 'Final Assembly', group: 'GROUP_2', aliases: ['12-b', '12b', '12 assembly', 'final assembly', 'assembly'] },
  { code: '14', name: '14 Calibration', label: 'Calibration', group: 'GROUP_2', aliases: ['14', 'calibration', '14 calibration'] },
  { code: '15', name: '15 Packing & Dispatch', label: 'Packing & Dispatch', group: 'GROUP_2', aliases: ['15', 'packing', '15 packing', 'dispatch', 'packing & dispatch'] },
  { code: '16', name: '16 IT', label: 'IT', group: 'GROUP_2', aliases: ['16', '13', 'it', '16 it', '13 it-computer inspection', 'computer inspection'] },
];

export const ALL_MONTHLY_PLAN_DEPTS = [...MONTHLY_PLAN_GROUP_1_DEPTS, ...MONTHLY_PLAN_GROUP_2_DEPTS];

export const DEFECT_CATEGORIES = [
  'Dimensional',
  'GD & T',
  'Crack',
  'Damaged',
  'Blow Holes',
  'Glue Marks',
  'Oil Marks',
  'Patch Marks',
  'Pencil Marks',
  'Pad Marks',
  'Scratch Marks',
  'Polish',
  'Tapping',
  'Wheel Marks',
  'Material Defect',
] as const;

export type DefectCategory = (typeof DEFECT_CATEGORIES)[number];

export const REJECTION_REASONS = [
  'Dimension Out of Tolerance',
  'Drawing Mismatch',
  'Material Issue',
  'Wrong Part',
  'Surface Finish Issue',
  'Assembly Issue',
  'Damage',
  'Hole/Thread Issue',
  'Quality Parameter Not Achieved',
  'Previous Process Issue',
  'Quantity Issue',
  'Other',
] as const;

export const MACHINE_STATUSES = [
  'Not Started',
  'In Progress',
  'On Track',
  'Delayed',
  'Rework Required',
  'Quality Hold', // legacy
  'Completed',
  'Ready for Packing',
  'Dispatched',
] as const;

export const DOCUMENT_CATEGORIES = [
  'Balloon Drawing',
  'Machine Drawing',
  'Inspection Drawing',
  'Quality Documents',
  'Inspection Reports',
  'Previous Reports',
  'Photos',
  'Other Documents',
] as const;

export const HISTORICAL_MONTHS = [
  'March 2026',
  'April 2026',
  'May 2026',
  'June 2026',
  'July 2026',
  'August 2026',
  'September 2026',
  'October 2026',
  'November 2026',
  'December 2026',
  'January 2027',
  'February 2027',
  'March 2027',
];

export const USER_ROLES = [
  'ADMIN',
  'PLANNING',
  'QUALITY',
  'DEPARTMENT USER',
  'MANAGEMENT / VIEWER',
] as const;

