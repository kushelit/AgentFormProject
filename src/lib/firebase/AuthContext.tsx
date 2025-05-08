'use client';

import { 
  User, 
  onAuthStateChanged, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  UserCredential, 
  browserSessionPersistence, 
  setPersistence 
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

type AuthContextType = {
  user: User | null;
  detail: UserDetail | null;
  isLoading: boolean;
  rolesPermissions: RolesPermissionsMap;
  logIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string) => Promise<UserCredential>;
  logOut: () => Promise<void>;
};

type UserDetail = {
  name: string;
  email: string;
  agentId: string;
  agencyId: string;
  role: 'agent' | 'worker' | 'admin' | 'manager';
  subscriptionId?: string;
  permissionOverrides?: {
    allow?: string[];
    deny?: string[];
  };
};

type RolesPermissionsMap = {
  [role: string]: string[];
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  detail: null,
  isLoading: true,
  rolesPermissions: {},
  logIn: async () => { throw new Error("logIn not implemented"); },
  signUp: async () => { throw new Error("signUp not implemented"); },
  logOut: async () => { throw new Error("logOut not implemented"); },
});

export const AuthContextProvider = (props: any) => {
  const [user, setUser] = useState<User | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rolesPermissions, setRolesPermissions] = useState<RolesPermissionsMap>({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid);
        getDoc(docRef)
          .then(async (docSnap) => {
            const data = docSnap.data();
            setDetail(data as UserDetail);

            const rolesToFetch = ['agent', 'worker', 'admin', 'manager'];
            const rolesData: RolesPermissionsMap = {};

            await Promise.all(
              rolesToFetch.map(async (role) => {
                const roleDoc = await getDoc(doc(db, 'roles', role));
                if (roleDoc.exists()) {
                  rolesData[role] = roleDoc.data().permissions || [];
                } else {
                  rolesData[role] = [];
                }
              })
            );

            setRolesPermissions(rolesData);
            setIsLoading(false);
          });
      } else {
        setDetail(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const logIn = async (email: string, password: string) => {
    return setPersistence(auth, browserSessionPersistence)
      .then(() => {
        return signInWithEmailAndPassword(auth, email, password);
      });
  };

  const signUp = async (email: string, password: string) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const logOut = async () => {
    return signOut(auth);
  };

  return (
    <AuthContext.Provider
      {...props}
      value={{ user, detail, isLoading, rolesPermissions, logIn, signUp, logOut }}
    />
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
