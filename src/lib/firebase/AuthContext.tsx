'use client';

import {
  User,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  UserCredential,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

// טיפוסים
type AuthContextType = {
  user: User | null;
  detail: UserDetail | null;
  isLoading: boolean;
  rolesPermissions: RolesPermissionsMap;
  logIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string) => Promise<UserCredential>;
  logOut: () => Promise<void>;
};

export type UserDetail = {
  name: string;
  email: string;
  agentId: string;
  agencyId: string;
  role: 'agent' | 'worker' | 'admin' | 'manager';
  isActive?: boolean;
  subscriptionId?: string;
  subscriptionType?: string;
  permissionOverrides?: {
    allow?: string[];
    deny?: string[];
  };
  addOns?: {
    leadsModule?: boolean;
    extraWorkers?: number;
  };
};

type RolesPermissionsMap = {
  [role: string]: string[];
};

// קונטקסט
export const AuthContext = createContext<AuthContextType | null>(null);

// פרוביידר
export const AuthContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rolesPermissions, setRolesPermissions] = useState<RolesPermissionsMap>({});
  const [isClient, setIsClient] = useState(false);

  // מזהה שאנחנו ב-client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setDetail(null);
        setIsLoading(false);
        return;
      }

      const docRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        setUser(null);
        setDetail(null);
        setIsLoading(false);
        return;
      }

      const data = docSnap.data() as UserDetail;

      if (data?.isActive === false) {
        setUser(null);
        setDetail(null);
        setIsLoading(false);
        return;
      }

      setUser(currentUser);
      setDetail(data);

      const rolesToFetch = ['agent', 'worker', 'admin', 'manager'];
      const rolesData: RolesPermissionsMap = {};

      await Promise.all(
        rolesToFetch.map(async (role) => {
          const roleDoc = await getDoc(doc(db, 'roles', role));
          rolesData[role] = roleDoc.exists() ? roleDoc.data().permissions || [] : [];
        })
      );

      setRolesPermissions(rolesData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isClient]);

  
// פעולות התחברות/התנתקות
const logIn = async (email: string, password: string) => {
  await setPersistence(auth, browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
};

const signUp = async (email: string, password: string) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

const logOut = async () => {
  try {
    // קודם כל נקה את הסטייט מיד
    setUser(null);
    setDetail(null);
    
    // עכשיו התנתק מFirebase
    await signOut(auth);
  } catch (error) {
    // console.error('Error signing out:', error);
  }
};
  // מניעת רינדור אם לא ב-client
  if (!isClient) return null;

  return (
    <AuthContext.Provider
      value={{ user, detail, isLoading, rolesPermissions, logIn, signUp, logOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// פונקציית hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthContextProvider");
  }
  return context;
};
