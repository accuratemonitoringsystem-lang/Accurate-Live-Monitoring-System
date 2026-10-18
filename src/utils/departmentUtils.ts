import { INITIAL_DEPARTMENTS, PRODUCTION_DEPARTMENTS } from '../constants';

/**
 * Normalizes a department key for comparison.
 * Maps legacy/sub department strings to canonical identity:
 * - Design Regular & Design Engineering -> '01 Design'
 * - Planning Open Cable & Planning Accessories -> '02 Planning'
 * - 07A, 07B, 07C Lapping -> Distinct lapping departments
 * - 12 Bridge Assembly vs 12 Assembly -> Distinct departments
 */
export function normalizeDepartmentKey(dept?: string): string {
  if (!dept) return '';
  const clean = dept.trim().toLowerCase();

  // 1. Consolidated Design: 01-A, 01-B, Design-A Regular, Design-A Engineering, Design -> '01 Design'
  if (
    clean === 'design' ||
    clean === '01' ||
    clean === '01 design' ||
    clean.includes('design-a') ||
    clean.includes('design regular') ||
    clean.includes('design engineering') ||
    clean.startsWith('01-a') ||
    clean.startsWith('01-b') ||
    clean === '01_design' ||
    clean === 'design_department'
  ) {
    return '01 design';
  }

  // 2. Consolidated Planning: 02-A, 02-B, 02-C, Planning Open Cable, Planning Accessories, Planning -> '02 Planning'
  if (
    clean === 'planning' ||
    clean === '02' ||
    clean === '02 planning' ||
    clean.includes('planning open cable') ||
    clean.includes('planning accessories') ||
    clean.startsWith('02-a') ||
    clean.startsWith('02-b') ||
    clean.startsWith('02-c') ||
    clean === '02_planning'
  ) {
    return '02 planning';
  }

  // 3. Distinct Lapping Departments
  if (
    clean.includes('07a') ||
    clean.includes('flatness') ||
    clean.includes('insert fitment') ||
    clean.includes('07a_lapping')
  ) {
    return '07a-lapping-flatness & insert fitment';
  }
  if (
    clean.includes('07b') ||
    clean.includes('y3') ||
    clean.includes('slot') ||
    clean.includes('07b_lapping')
  ) {
    return '07b-lapping-y3 & slot';
  }
  if (
    clean.includes('07c') ||
    clean.includes('rtlt') ||
    clean.includes('top bottom') ||
    clean.includes('07c_lapping')
  ) {
    return '07c-lapping-rtlt & top bottom';
  }

  // 4. Bridge Assembly vs Assembly
  if (clean.includes('bridge') && clean.includes('assembly')) {
    return '12 bridge assembly';
  }
  if (clean.includes('sub') && clean.includes('assembly')) {
    return '08 sub assembly';
  }
  if (
    (clean.includes('12') || clean === 'assembly' || clean === 'main assembly') &&
    !clean.includes('bridge') &&
    !clean.includes('sub')
  ) {
    return '12 assembly';
  }

  // 5. Paint Shop
  if (clean.includes('paint') && (clean.includes('class') || clean.includes('10-a'))) {
    return '10-a paint shop-a class item';
  }
  if (clean.includes('paint') && (clean.includes('guard') || clean.includes('10-b'))) {
    return '10-b paint shop-guard set';
  }

  // 6. Electronics
  if (clean.includes('electron') && (clean.includes('cable') || clean.includes('11-a'))) {
    return '11-a electronics-cable set';
  }
  if (clean.includes('electron') && (clean.includes('tuning') || clean.includes('11-b'))) {
    return '11-b electronics-tuning';
  }

  // 7. Shop Fabrication
  if (clean.includes('metal') && clean.includes('shop')) {
    return '06-a metal shop';
  }
  if (clean.includes('granite') && clean.includes('shop')) {
    return '06-b granite shop';
  }

  // 8. Quality & Calibration
  if (clean.includes('calibration') || clean.includes('14')) {
    return '14 calibration';
  }
  if (clean.includes('inward quality') || clean === '04' || clean.includes('04 inward')) {
    return '04 inward quality';
  }

  return clean;
}

/**
 * Robust department matching utility that handles:
 * - Consolidation of Design (01-A, 01-B -> 01 Design)
 * - Consolidation of Planning (02-A, 02-B -> 02 Planning)
 * - Separation of 07A, 07B, 07C Lapping
 * - Separation of 12 Bridge Assembly vs 12 Assembly
 * - Prefixed codes ("06-A Metal Shop" vs "Metal Shop")
 * - Case-insensitive comparisons
 */
export function isDepartmentMatch(deptA?: string, deptB?: string): boolean {
  if (!deptA || !deptB) return false;
  const a = deptA.trim().toLowerCase();
  const b = deptB.trim().toLowerCase();
  if (a === b) return true;

  // Normalized key match
  const normA = normalizeDepartmentKey(a);
  const normB = normalizeDepartmentKey(b);
  if (normA && normB && normA === normB) {
    return true;
  }

  // Explicit negative guards for critical distinct departments
  // 1. Lapping partitions must never cross-match
  const isLappingA = normA.includes('lapping');
  const isLappingB = normB.includes('lapping');
  if (isLappingA && isLappingB && normA !== normB) {
    return false;
  }

  // 2. Bridge Assembly vs Assembly vs Sub Assembly must never cross-match
  const isBridgeA = normA.includes('bridge');
  const isBridgeB = normB.includes('bridge');
  if (isBridgeA !== isBridgeB) {
    return false;
  }

  const isSubA = normA.includes('sub');
  const isSubB = normB.includes('sub');
  if (isSubA !== isSubB) {
    return false;
  }

  // 3. Metal Shop vs Granite Shop
  const isMetalA = normA.includes('metal');
  const isMetalB = normB.includes('metal');
  const isGraniteA = normA.includes('granite');
  const isGraniteB = normB.includes('granite');
  if ((isMetalA && isGraniteB) || (isGraniteA && isMetalB)) {
    return false;
  }

  // Extract leading codes e.g. "06-a", "12", "07a"
  const codeAMatch = a.match(/^([0-9]+(-?[a-z])?)\b/);
  const codeBMatch = b.match(/^([0-9]+(-?[a-z])?)\b/);

  // If both have distinct department codes, they are strictly different departments
  if (codeAMatch && codeBMatch && codeAMatch[1] !== codeBMatch[1]) {
    // Exception for Design (01, 01-a, 01-b) and Planning (02, 02-a, 02-b) handled above in normalize
    return false;
  }
  if (codeAMatch && codeBMatch && codeAMatch[1] === codeBMatch[1]) {
    return true;
  }

  // Strip code prefixes
  const cleanA = a.replace(/^[0-9]+(-?[a-z])?\s+/, '').trim();
  const cleanB = b.replace(/^[0-9]+(-?[a-z])?\s+/, '').trim();
  if (cleanA && cleanB && cleanA === cleanB) return true;

  // Quality aliases
  const isQA = cleanA === 'quality' || cleanA.includes('inward quality');
  const isQB = cleanB === 'quality' || cleanB.includes('inward quality');
  if (isQA && isQB) return true;

  // Check if one contains the other
  if (cleanA && cleanB && (cleanA.includes(cleanB) || cleanB.includes(cleanA))) {
    const wordsA = cleanA.split(/\s+/).filter((w) => !['shop', 'item', 'set', 'fitment'].includes(w));
    const wordsB = cleanB.split(/\s+/).filter((w) => !['shop', 'item', 'set', 'fitment'].includes(w));
    const common = wordsA.filter((w) => wordsB.includes(w));
    if (common.length > 0) return true;
  }

  return false;
}

/**
 * Finds the canonical department from INITIAL_DEPARTMENTS
 */
export function getCanonicalDepartment(deptName?: string): string {
  if (!deptName) return '';
  const found = INITIAL_DEPARTMENTS.find((d) => isDepartmentMatch(d.name, deptName));
  return found ? found.name : deptName;
}

/**
 * Gets index of department in the production manufacturing sequence (excluding Design)
 */
export function getDepartmentIndex(deptName?: string): number {
  if (!deptName) return -1;
  return PRODUCTION_DEPARTMENTS.findIndex((d) => isDepartmentMatch(d.name, deptName));
}

/**
 * Gets the next department according to the standard production manufacturing route (strictly excluding Design)
 */
export function getNextDepartmentInRoute(currentDept?: string): string {
  if (!currentDept) return PRODUCTION_DEPARTMENTS[0]?.name || '02 Planning';
  const idx = getDepartmentIndex(currentDept);
  if (idx >= 0 && idx < PRODUCTION_DEPARTMENTS.length - 1) {
    return PRODUCTION_DEPARTMENTS[idx + 1].name;
  }
  return PRODUCTION_DEPARTMENTS[PRODUCTION_DEPARTMENTS.length - 1]?.name || currentDept;
}

/**
 * Gets the previous department in production route
 */
export function getPreviousDepartmentInRoute(currentDept?: string): string | null {
  if (!currentDept) return null;
  const idx = getDepartmentIndex(currentDept);
  if (idx > 0) {
    return PRODUCTION_DEPARTMENTS[idx - 1].name;
  }
  return null;
}

/**
 * Checks if a department is Quality Control (Inward Quality or Calibration or Quality role)
 */
export function isQualityDepartment(deptName?: string): boolean {
  if (!deptName) return false;
  const lower = deptName.toLowerCase();
  return (
    lower.includes('quality') ||
    lower.includes('inward quality') ||
    lower.includes('calibration') ||
    lower.includes('qc') ||
    lower.includes('qa') ||
    lower.includes('inspection') ||
    isDepartmentMatch(deptName, '04 Inward Quality') ||
    isDepartmentMatch(deptName, '14 Calibration')
  );
}

/**
 * Checks whether user has authorization to perform Quality Inspection decisions
 * (Hold, Reject, Accept). Strictly grants access ONLY to authenticated users with
 * the authorized Quality role, Quality department personnel, or System Administrators.
 * All normal production departments are strictly denied decision access.
 */
export function hasQualityInspectionAccess(
  userProfile?: {
    role?: string;
    department?: string;
    email?: string;
    username?: string;
    employeeName?: string;
    displayName?: string;
  } | null
): boolean {
  // If not authenticated or no user profile, strictly DENY decision permission
  if (!userProfile) return false;

  // 1. Role Check (Admin or Quality role)
  const role = (userProfile.role || '').toUpperCase().trim();
  if (
    role === 'ADMIN' ||
    role === 'SUPERADMIN' ||
    role === 'QUALITY' ||
    role === 'QC' ||
    role === 'QA' ||
    role === 'QUALITY_HEAD' ||
    role === 'QUALITY_INSPECTOR' ||
    role.includes('ADMIN') ||
    role.includes('QUALITY') ||
    role.includes('INSPECT')
  ) {
    return true;
  }

  // 2. Department Check (Quality control departments)
  const dept = (userProfile.department || '').toLowerCase().trim();
  if (
    dept === 'admin' ||
    dept.includes('system admin') ||
    isQualityDepartment(userProfile.department) ||
    isDepartmentMatch(userProfile.department, '04 Inward Quality') ||
    isDepartmentMatch(userProfile.department, '14 Calibration')
  ) {
    return true;
  }

  // 3. Username or Employee Code/Name Check for bootstrap quality/admin users
  const username = (userProfile.username || '').toLowerCase().trim();
  if (
    username === 'administrator' ||
    username === 'admin' ||
    username === 'quality' ||
    username.startsWith('qc_') ||
    username.startsWith('qa_')
  ) {
    return true;
  }

  const name = (userProfile.displayName || userProfile.employeeName || '').toLowerCase().trim();
  if (name.includes('administrator') || name.includes('quality inspector') || name.includes('quality head')) {
    return true;
  }

  // 4. Email Check for system admin / quality mailboxes
  const email = (userProfile.email || '').toLowerCase().trim();
  if (
    email.startsWith('admin@') ||
    email.startsWith('quality@') ||
    email === 'accuratemonitoringsystem@gmail.com'
  ) {
    return true;
  }

  // All other users (Metal Shop, Lapping, Assembly, Paint, Design, Planning, etc.) are strictly false
  return false;
}

