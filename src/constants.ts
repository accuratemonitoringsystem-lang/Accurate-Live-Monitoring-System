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

