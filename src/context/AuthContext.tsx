import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, UserRole } from '../types';
import {
  authenticateDepartmentLogin,
  ensureAllDepartmentAccountsExist,
  changeUserPassword,
  forceSetNewPassword,
  submitPasswordResetRequest,
} from '../services/authService';

interface AuthContextType {
  userProfile: UserProfile | null;
  currentUser: UserProfile | null;
  loading: boolean;
  login: (username: string, password: string, selectedDepartmentName?: string) => Promise<UserProfile>;
  logout: () => void;
  signOut: () => Promise<void>;
  switchActiveDepartment: (department: string) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  forceSetPassword: (newPassword: string) => Promise<void>;
  dismissPasswordChangePrompt: () => void;
  requestPasswordReset: (username: string, authorityName?: string, contactInfo?: string, reason?: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_SESSION_KEY = 'ag_ipl_user_session';
const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours shift duration

interface StoredSession {
  profile: UserProfile;
  timestamp: number;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Initialize Department Accounts and restore session on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        await ensureAllDepartmentAccountsExist();

        // Restore existing session
        const rawSession = localStorage.getItem(AUTH_SESSION_KEY);
        if (rawSession) {
          try {
            const parsed = JSON.parse(rawSession) as StoredSession;
            const now = Date.now();
            if (now - parsed.timestamp < SESSION_EXPIRY_MS && parsed.profile) {
              setUserProfile(parsed.profile);
            } else {
              localStorage.removeItem(AUTH_SESSION_KEY);
              setUserProfile(null);
            }
          } catch {
            localStorage.removeItem(AUTH_SESSION_KEY);
            setUserProfile(null);
          }
        }
      } catch (err) {
        console.error('Failed to bootstrap auth accounts:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (
    username: string,
    password: string,
    selectedDepartmentName?: string
  ): Promise<UserProfile> => {
    setLoading(true);
    try {
      const profile = await authenticateDepartmentLogin(
        username,
        password,
        selectedDepartmentName
      );

      const session: StoredSession = {
        profile,
        timestamp: Date.now(),
      };

      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      setUserProfile(profile);
      return profile;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    setUserProfile(null);
  };

  const signOut = async () => {
    logout();
  };

  const switchActiveDepartment = (department: string) => {
    if (!userProfile) return;
    if (userProfile.role !== 'ADMIN') {
      console.warn('Department switching is restricted to Administrator.');
      return;
    }

    const updatedProfile: UserProfile = {
      ...userProfile,
      department,
      updatedAt: new Date().toISOString(),
    };

    const session: StoredSession = {
      profile: updatedProfile,
      timestamp: Date.now(),
    };

    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    setUserProfile(updatedProfile);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!userProfile) throw new Error('Not authenticated.');
    await changeUserPassword(userProfile.id, currentPassword, newPassword, userProfile.email);
    // Update local profile
    const updated = { ...userProfile, mustChangePassword: false };
    setUserProfile(updated);
    localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({ profile: updated, timestamp: Date.now() })
    );
  };

  const forceSetPassword = async (newPassword: string) => {
    if (!userProfile) throw new Error('Not authenticated.');
    await forceSetNewPassword(userProfile.id, newPassword, userProfile.email);
    // Update local profile
    const updated = { ...userProfile, mustChangePassword: false };
    setUserProfile(updated);
    localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({ profile: updated, timestamp: Date.now() })
    );
  };

  const dismissPasswordChangePrompt = () => {
    if (!userProfile) return;
    const updated = { ...userProfile, mustChangePassword: false };
    setUserProfile(updated);
  };

  const requestPasswordReset = async (
    username: string,
    authorityName?: string,
    contactInfo?: string,
    reason?: string
  ) => {
    await submitPasswordResetRequest({ username, authorityName, contactInfo, reason });
  };

  return (
    <AuthContext.Provider
      value={{
        userProfile,
        currentUser: userProfile,
        loading,
        login,
        logout,
        signOut,
        switchActiveDepartment,
        changePassword,
        forceSetPassword,
        dismissPasswordChangePrompt,
        requestPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
