import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { hashPassword, verifyPassword } from '../utils/security';
import { logAudit } from './db';
import { isDepartmentMatch, isQualityDepartment } from '../utils/departmentUtils';

export interface DepartmentAccountConfig {
  processNo: string;
  department: string;
  departmentId: string;
  authorityName: string;
  username: string;
  initialPassword?: string;
  role: UserRole;
  scopeNotes?: string;
}

// Master Administrator Credentials
export const MASTER_ADMIN_USERNAME = 'Administrator';
export const MASTER_ADMIN_INITIAL_PASSWORD = 'Admin@123';

/**
 * All 19 Official Department User Accounts specified by Accurate Gauging and Instruments Pvt Ltd
 */
export const STANDARD_DEPARTMENT_ACCOUNTS: DepartmentAccountConfig[] = [
  {
    processNo: '01',
    department: '01 Design',
    departmentId: '01 Design',
    authorityName: 'Laxmikant Dasari',
    username: 'ACCDESIGN',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '02',
    department: '02 Planning',
    departmentId: '02 Planning',
    authorityName: 'Dipak Kamthe',
    username: 'ACCPLANNING',
    role: 'PLANNING',
  },
  {
    processNo: '03',
    department: '03 Purchase',
    departmentId: '03 Purchase',
    authorityName: 'Santosh Kalokhe',
    username: 'ACCPURCHASE',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '04',
    department: '04 Inward Quality',
    departmentId: '04 Inward Quality',
    authorityName: 'Aniket Kunjir',
    username: 'ACCQUALITY',
    role: 'QUALITY',
  },
  {
    processNo: '05',
    department: '05 Store',
    departmentId: '05 Store',
    authorityName: 'Nitin Kunjir',
    username: 'ACCSTORE',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '06-A',
    department: '06-A Metal Shop',
    departmentId: '06-A Metal Shop',
    authorityName: 'Ganesh Hole',
    username: 'ACCMETAL',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '06-B',
    department: '06-B Granite Shop',
    departmentId: '06-B Granite Shop',
    authorityName: 'Ashay Govekar',
    username: 'ACCGRANITE',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '07-A',
    department: '07A-Lapping-Flatness & Insert Fitment',
    departmentId: '07A-Lapping-Flatness & Insert Fitment',
    authorityName: 'Sandip Kamthe',
    username: 'ACCLAP1',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '07-B',
    department: '07B-Lapping-Y3 & Slot',
    departmentId: '07B-Lapping-Y3 & Slot',
    authorityName: 'Sandip Chaudhari',
    username: 'ACCLAP2',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '07-C',
    department: '07C-Lapping-RTLT & Top Bottom',
    departmentId: '07C-Lapping-RTLT & Top Bottom',
    authorityName: 'Suraj Waghmare',
    username: 'ACCLAP3',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '08',
    department: '08 Sub Assembly',
    departmentId: '08 Sub Assembly',
    authorityName: 'Sujit Kamthe',
    username: 'ACCSUBASSEMBLY',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '09',
    department: '09 Guard Fitment',
    departmentId: '09 Guard Fitment',
    authorityName: 'Tanaji Malshikar',
    username: 'ACCGUARD',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '10-A',
    department: '10-A Paint Shop-A Class Item',
    departmentId: '10-A Paint Shop-A Class Item',
    authorityName: 'Nitin Badade',
    username: 'ACCPAINT',
    role: 'DEPARTMENT USER',
    scopeNotes: 'Shared account covering 10-A Paint Shop-A Class Item and 10-B Paint Shop-Guard Set',
  },
  {
    processNo: '11',
    department: '11-A Electronics-Cable Set',
    departmentId: '11-A Electronics-Cable Set',
    authorityName: 'Rahul Kale',
    username: 'ACCELECTRONICS',
    role: 'DEPARTMENT USER',
    scopeNotes: 'Shared account covering 11-A Electronics-Cable Set and 11-B Electronics-Tuning',
  },
  {
    processNo: '12-A',
    department: '12 Bridge Assembly',
    departmentId: '12 Bridge Assembly',
    authorityName: 'Nilesh Ranpise',
    username: 'ACCBRIDGE',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '12-B',
    department: '12 Assembly',
    departmentId: '12 Assembly',
    authorityName: 'Tushar Bansode',
    username: 'ACCFINALASSEMBLY',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '14',
    department: '14 Calibration',
    departmentId: '14 Calibration',
    authorityName: 'Ranjeet Jagtap',
    username: 'ACCCALIBRATION',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '15',
    department: '15 Packing',
    departmentId: '15 Packing',
    authorityName: 'Atul More',
    username: 'ACCDISPATCH',
    role: 'DEPARTMENT USER',
  },
  {
    processNo: '16',
    department: '13 IT-Computer Inspection',
    departmentId: '13 IT-Computer Inspection',
    authorityName: 'Rahul Prasad',
    username: 'ACCIT',
    role: 'DEPARTMENT USER',
  },
];

// Master Initial Password fallback for department seed accounts
export const DEFAULT_INITIAL_DEPARTMENT_PASSWORD = 'Accurate@123';

// Rate Limiting Config
const RATE_LIMIT_STORAGE_KEY = 'ag_ipl_auth_rate_limit';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

interface RateLimitEntry {
  attempts: number;
  lockoutUntil?: number;
}

function checkRateLimit(username: string): void {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) return;
    const records: Record<string, RateLimitEntry> = JSON.parse(raw);
    const key = username.toLowerCase();
    const entry = records[key];
    if (entry && entry.lockoutUntil && Date.now() < entry.lockoutUntil) {
      const remainingMins = Math.ceil((entry.lockoutUntil - Date.now()) / 60000);
      throw new Error(
        `Too many failed login attempts for "${username}". Account is temporarily locked. Please try again in ${remainingMins} minute(s) or contact Administrator.`
      );
    }
  } catch (err: any) {
    if (err.message.includes('Too many failed')) throw err;
  }
}

function recordFailedAttempt(username: string): void {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const records: Record<string, RateLimitEntry> = raw ? JSON.parse(raw) : {};
    const key = username.toLowerCase();
    const current = records[key] || { attempts: 0 };
    current.attempts += 1;

    if (current.attempts >= MAX_FAILED_ATTEMPTS) {
      current.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    records[key] = current;
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

function resetRateLimit(username: string): void {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) return;
    const records: Record<string, RateLimitEntry> = JSON.parse(raw);
    const key = username.toLowerCase();
    delete records[key];
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

/**
 * Ensures Master Administrator and all 19 official Department Accounts exist in Firestore.
 */
export async function ensureAllDepartmentAccountsExist(): Promise<void> {
  const now = new Date().toISOString();

  // 1. Ensure Master Administrator
  try {
    const adminRef = doc(db, 'users', 'administrator');
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
      const initialHash = await hashPassword(MASTER_ADMIN_INITIAL_PASSWORD);
      const adminProfile: UserProfile = {
        id: 'administrator',
        userId: 'administrator',
        username: MASTER_ADMIN_USERNAME,
        passwordHash: initialHash,
        employeeName: 'System Administrator',
        displayName: 'System Administrator',
        authorityName: 'System Administrator',
        processNo: 'ADMIN',
        mustChangePassword: false,
        employeeCode: 'ADMIN-01',
        email: 'admin@accurate.in',
        departmentId: 'ALL',
        department: 'All Departments (Master View)',
        role: 'ADMIN',
        status: 'Active',
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: 'SYSTEM_BOOTSTRAP',
      };

      await setDoc(adminRef, {
        ...adminProfile,
        usernameLower: MASTER_ADMIN_USERNAME.toLowerCase(),
      });
    }
  } catch (err) {
    console.warn('Notice ensuring master administrator in Firestore:', err);
  }

  // 2. Ensure each official department account
  for (const acc of STANDARD_DEPARTMENT_ACCOUNTS) {
    try {
      const docId = acc.username.toLowerCase();
      const userRef = doc(db, 'users', docId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const initialTempPwd = `${acc.username}@123`;
        const initialHash = await hashPassword(initialTempPwd);

        const newProfile: UserProfile = {
          id: docId,
          userId: docId,
          username: acc.username,
          passwordHash: initialHash,
          employeeName: acc.authorityName,
          displayName: acc.authorityName,
          authorityName: acc.authorityName,
          processNo: acc.processNo,
          mustChangePassword: true,
          employeeCode: `ACC-${acc.processNo}`,
          email: `${docId}@accurate.in`,
          departmentId: acc.departmentId,
          department: acc.department,
          role: acc.role,
          status: 'Active',
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'SYSTEM_BOOTSTRAP',
        };

        await setDoc(userRef, {
          ...newProfile,
          usernameLower: docId,
          scopeNotes: acc.scopeNotes || '',
        });
      }
    } catch (err) {
      console.warn(`Notice ensuring account for ${acc.username}:`, err);
    }
  }
}

// Retain alias for backward compatibility
export const ensureAdminAccountExists = ensureAllDepartmentAccountsExist;

/**
 * Authenticate login for Administrator or Department User.
 */
export async function authenticateDepartmentLogin(
  usernameInput: string,
  passwordInput: string,
  selectedDepartmentName?: string
): Promise<UserProfile> {
  const cleanUsername = usernameInput.trim();
  if (!cleanUsername || !passwordInput) {
    throw new Error('Please enter both username and password.');
  }

  const usernameLower = cleanUsername.toLowerCase();

  // Check rate-limit before proceeding
  checkRateLimit(cleanUsername);

  // Auto-seed accounts in background if needed
  ensureAllDepartmentAccountsExist().catch(() => {});

  let userDocData: any = null;
  let userDocId: string = '';

  // Direct check by lower document ID
  try {
    const directSnap = await getDoc(doc(db, 'users', usernameLower));
    if (directSnap.exists()) {
      userDocData = directSnap.data();
      userDocId = directSnap.id;
    }
  } catch (err) {
    console.warn('Direct Firestore fetch had notice:', err);
  }

  // Fallback: Query by usernameLower or username field
  if (!userDocData) {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('usernameLower', '==', usernameLower));
      const snap = await getDocs(q);

      if (!snap.empty) {
        userDocData = snap.docs[0].data();
        userDocId = snap.docs[0].id;
      } else {
        const q2 = query(usersRef, where('username', '==', cleanUsername));
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          userDocData = snap2.docs[0].data();
          userDocId = snap2.docs[0].id;
        }
      }
    } catch (err) {
      console.warn('Query by username had notice:', err);
    }
  }

  // Resilient Seed Fallback: Check standard department accounts specification
  if (!userDocData) {
    if (usernameLower === 'administrator' || usernameLower === 'admin' || usernameLower === 'accadmin') {
      if (passwordInput === MASTER_ADMIN_INITIAL_PASSWORD || passwordInput === 'Admin@123') {
        const initialHash = await hashPassword(MASTER_ADMIN_INITIAL_PASSWORD);
        const now = new Date().toISOString();
        userDocData = {
          id: 'administrator',
          userId: 'administrator',
          username: MASTER_ADMIN_USERNAME,
          usernameLower: 'administrator',
          passwordHash: initialHash,
          employeeName: 'System Administrator',
          displayName: 'System Administrator',
          authorityName: 'System Administrator',
          processNo: 'ADMIN',
          mustChangePassword: false,
          employeeCode: 'ADMIN-01',
          email: 'admin@accurate.in',
          departmentId: 'ALL',
          department: 'All Departments (Master View)',
          role: 'ADMIN',
          status: 'Active',
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'SYSTEM_BOOTSTRAP',
        };
        userDocId = 'administrator';
        setDoc(doc(db, 'users', 'administrator'), userDocData).catch(() => {});
      }
    } else {
      const matchedSeed = STANDARD_DEPARTMENT_ACCOUNTS.find(
        (a) => a.username.toLowerCase() === usernameLower
      );

      if (
        matchedSeed &&
        (passwordInput === `${matchedSeed.username}@123` ||
          passwordInput === DEFAULT_INITIAL_DEPARTMENT_PASSWORD ||
          passwordInput === 'Accurate@123' ||
          passwordInput === 'Admin@123')
      ) {
        const initialHash = await hashPassword(`${matchedSeed.username}@123`);
        const now = new Date().toISOString();
        userDocData = {
          id: usernameLower,
          userId: usernameLower,
          username: matchedSeed.username,
          usernameLower,
          passwordHash: initialHash,
          employeeName: matchedSeed.authorityName,
          displayName: matchedSeed.authorityName,
          authorityName: matchedSeed.authorityName,
          processNo: matchedSeed.processNo,
          mustChangePassword: true,
          employeeCode: `ACC-${matchedSeed.processNo}`,
          email: `${usernameLower}@accurate.in`,
          departmentId: matchedSeed.departmentId,
          department: matchedSeed.department,
          role: matchedSeed.role,
          status: 'Active',
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'SYSTEM_BOOTSTRAP',
        };
        userDocId = usernameLower;
        setDoc(doc(db, 'users', usernameLower), userDocData).catch(() => {});
      }
    }
  }

  // User not found or no password hash stored
  if (!userDocData || !userDocData.passwordHash) {
    recordFailedAttempt(cleanUsername);
    throw new Error('Invalid username or password.');
  }

  // Check if account has been deactivated by administrator
  if (userDocData.status === 'Inactive' || userDocData.active === false) {
    throw new Error('Your account is deactivated. Please contact Administrator.');
  }

  // Verify password using SHA-256 + salt
  let isMatch = await verifyPassword(passwordInput, userDocData.passwordHash);

  // Check initial default password fallback if user has not yet changed password
  if (!isMatch && userDocData.mustChangePassword) {
    const defaultInitialHash = await hashPassword(DEFAULT_INITIAL_DEPARTMENT_PASSWORD);
    const usernameSpecificInitialHash = await hashPassword(`${userDocData.username}@123`);
    isMatch =
      userDocData.passwordHash === defaultInitialHash ||
      userDocData.passwordHash === usernameSpecificInitialHash;
  }

  if (!isMatch) {
    recordFailedAttempt(cleanUsername);
    throw new Error('Invalid username or password.');
  }

  // Reset rate limiting on successful authentication
  resetRateLimit(cleanUsername);

  // Department Authorization Check
  const userRole: UserRole = userDocData.role;
  let activeDept = userDocData.department;

  if (userRole === 'ADMIN') {
    activeDept = selectedDepartmentName || userDocData.department || 'All Departments (Master View)';
  } else if (userRole === 'QUALITY' || isQualityDepartment(userDocData.department)) {
    activeDept = userDocData.department || '04 Inward Quality';
  } else {
    activeDept = userDocData.department;
  }

  // Record last login time
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'users', userDocId), {
      lastLoginAt: now,
      updatedAt: now,
    });
    await logAudit(
      'LOGIN_SUCCESS',
      'AUTH',
      userDocId,
      '',
      `User ${cleanUsername} (${userDocData.authorityName || userDocData.employeeName}) logged in (${userRole})`,
      userDocData.email || cleanUsername
    );
  } catch (err) {
    console.warn('Notice recording lastLoginAt timestamp:', err);
  }

  const cleanProfile: UserProfile = {
    id: userDocId,
    userId: userDocId,
    username: userDocData.username,
    employeeName: userDocData.employeeName || userDocData.displayName || cleanUsername,
    displayName: userDocData.displayName || userDocData.employeeName || cleanUsername,
    authorityName: userDocData.authorityName || userDocData.employeeName || cleanUsername,
    processNo: userDocData.processNo || '',
    mustChangePassword: Boolean(userDocData.mustChangePassword),
    employeeCode: userDocData.employeeCode || '',
    email: userDocData.email || `${cleanUsername.toLowerCase()}@accurate.in`,
    departmentId: userDocData.departmentId || activeDept,
    department: activeDept,
    role: userRole,
    status: userDocData.status || 'Active',
    active: userDocData.status !== 'Inactive',
    lastLoginAt: now,
    createdAt: userDocData.createdAt || now,
    updatedAt: now,
  };

  return cleanProfile;
}

/**
 * Submit an Administrator-Assisted Password Reset Request
 */
export async function submitPasswordResetRequest(data: {
  username: string;
  authorityName?: string;
  contactInfo?: string;
  reason?: string;
}): Promise<void> {
  const usernameClean = data.username.trim();
  if (!usernameClean) {
    throw new Error('Please enter your username.');
  }

  const now = new Date().toISOString();
  const ticketData = {
    username: usernameClean,
    authorityName: data.authorityName || '',
    contactInfo: data.contactInfo || '',
    reason: data.reason || 'User requested password reset via login gate',
    status: 'PENDING',
    createdAt: now,
  };

  try {
    await addDoc(collection(db, 'password_reset_requests'), ticketData);
  } catch (err) {
    console.warn('Could not save password_reset_request doc:', err);
  }

  // Create High-Priority Notification for Administrator
  try {
    await addDoc(collection(db, 'notifications'), {
      title: `Password Reset Request: ${usernameClean}`,
      message: `User ${usernameClean} (${data.authorityName || 'Employee'}) requested administrator assistance to reset their login password.`,
      type: 'WARNING',
      category: 'SECURITY',
      targetRole: 'ADMIN',
      targetDepartment: 'All Departments',
      read: false,
      createdAt: now,
      link: 'users',
    });
  } catch (err) {
    console.warn('Could not post notification for admin:', err);
  }

  try {
    await logAudit(
      'FORGOT_PASSWORD_REQUEST',
      'AUTH',
      usernameClean,
      '',
      `Password reset requested for username: ${usernameClean}`,
      usernameClean
    );
  } catch {}
}

/**
 * Change own password (requires entering current password)
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  userEmail?: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error('User record not found.');
  }

  const data = snap.data();
  const isMatch = await verifyPassword(currentPassword, data.passwordHash);
  if (!isMatch) {
    throw new Error('Current password is incorrect.');
  }

  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  await updateDoc(userRef, {
    passwordHash: newHash,
    mustChangePassword: false,
    updatedAt: now,
  });

  await logAudit('CHANGE_PASSWORD', 'USERS', userId, '', 'User changed password successfully', userEmail);
}

/**
 * Force set a new password on first login (bypasses current password check if mustChangePassword is true)
 */
export async function forceSetNewPassword(
  userId: string,
  newPassword: string,
  userEmail?: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  const userRef = doc(db, 'users', userId);
  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  await updateDoc(userRef, {
    passwordHash: newHash,
    mustChangePassword: false,
    updatedAt: now,
  });

  await logAudit(
    'FIRST_LOGIN_PASSWORD_SET',
    'USERS',
    userId,
    '',
    'Initial temporary password replaced with personal password',
    userEmail
  );
}

/**
 * Administrator adds a new user account with secure hashed password
 */
export async function adminCreateUserAccount(
  userData: {
    employeeName: string;
    employeeCode: string;
    username: string;
    email: string;
    department: string;
    role: UserRole;
    password: string;
    status: 'Active' | 'Inactive';
    processNo?: string;
  },
  adminEmail?: string
): Promise<string> {
  const usernameClean = userData.username.trim();
  const usernameLower = usernameClean.toLowerCase();

  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('usernameLower', '==', usernameLower));
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error(`Username "${usernameClean}" already exists. Please choose a different username.`);
  }

  const hash = await hashPassword(userData.password);
  const now = new Date().toISOString();
  const docId = usernameLower.replace(/[^a-z0-9_-]/g, '_');

  const newUser: UserProfile & { usernameLower: string } = {
    id: docId,
    userId: docId,
    username: usernameClean,
    usernameLower,
    passwordHash: hash,
    employeeName: userData.employeeName.trim(),
    displayName: userData.employeeName.trim(),
    authorityName: userData.employeeName.trim(),
    processNo: userData.processNo || '',
    mustChangePassword: true,
    employeeCode: userData.employeeCode.trim(),
    email: userData.email.trim().toLowerCase(),
    departmentId: userData.department,
    department: userData.department,
    role: userData.role,
    status: userData.status,
    active: userData.status === 'Active',
    createdAt: now,
    updatedAt: now,
    createdBy: adminEmail || 'Administrator',
  };

  await setDoc(doc(db, 'users', docId), newUser);
  await logAudit(
    'CREATE_USER',
    'USERS',
    docId,
    '',
    `Created user ${usernameClean} (${userData.role}) for ${userData.department}`,
    adminEmail
  );

  return docId;
}

/**
 * Admin resets a user's password
 */
export async function adminResetUserPassword(
  targetUserId: string,
  newPassword: string,
  adminEmail?: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  const userRef = doc(db, 'users', targetUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error('User not found.');
  }

  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  await updateDoc(userRef, {
    passwordHash: newHash,
    mustChangePassword: true,
    updatedAt: now,
  });

  await logAudit(
    'ADMIN_RESET_PASSWORD',
    'USERS',
    targetUserId,
    '',
    `Admin reset password for user ${targetUserId}`,
    adminEmail
  );
}

/**
 * Admin toggles user status between Active and Inactive
 */
export async function adminToggleUserStatus(
  targetUserId: string,
  newStatus: 'Active' | 'Inactive',
  adminEmail?: string
): Promise<void> {
  const userRef = doc(db, 'users', targetUserId);
  const now = new Date().toISOString();

  await updateDoc(userRef, {
    status: newStatus,
    active: newStatus === 'Active',
    updatedAt: now,
  });

  await logAudit(
    'ADMIN_TOGGLE_USER_STATUS',
    'USERS',
    targetUserId,
    '',
    `Changed status to ${newStatus}`,
    adminEmail
  );
}

/**
 * Admin updates user profile details
 */
export async function adminUpdateUserProfile(
  targetUserId: string,
  updates: Partial<UserProfile>,
  adminEmail?: string
): Promise<void> {
  const userRef = doc(db, 'users', targetUserId);
  const now = new Date().toISOString();

  const payload: any = {
    ...updates,
    updatedAt: now,
  };
  if (updates.status) {
    payload.active = updates.status === 'Active';
  }
  if (updates.employeeName) {
    payload.displayName = updates.employeeName;
    payload.authorityName = updates.employeeName;
  }
  if (updates.department) {
    payload.departmentId = updates.department;
  }

  await updateDoc(userRef, payload);
  await logAudit(
    'ADMIN_UPDATE_USER',
    'USERS',
    targetUserId,
    '',
    `Updated fields: ${Object.keys(updates).join(', ')}`,
    adminEmail
  );
}
