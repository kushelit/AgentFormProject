'use client';

import { User, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, UserCredential, updateCurrentUser } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase/firebase";
import { doc, getDoc } from "firebase/firestore";

type AuthContextType = {
  user: User | null;
  detail: UserDetail | null;
  logIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string) => Promise<UserCredential>;
  logOut: () => Promise<void>;
}

type UserDetail = {
  name: string;
  email: string;
} & (AgentDetail | WorkerDetail);

type AgentDetail = {
  role: 'agent';
}

type WorkerDetail = {
  role: 'worker';
  agentId: string;
}

// @ts-ignore
export const AuthContext = createContext<AuthContextType>();

export const AuthContextProvider = (props: any) => {
  const [user, setUser] = useState<User | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid);
        getDoc(docRef)
          .then((doc) => {
            if (doc.exists()) {
              const data = doc.data();
              setDetail(data as UserDetail);
            }
          });
        } else {
          setDetail(null); // Reset user details when logged out
        }
    });

    return () => unsubscribe();
  }, []);

  const logIn = async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  const logOut = async () => {
    return signOut(auth);
  };

  return (
    <AuthContext.Provider
      {...props}
      value={{ user, detail, logIn, logOut, signUp }}
    />
  )
}

export function useAuth() {
  return useContext(AuthContext);
}