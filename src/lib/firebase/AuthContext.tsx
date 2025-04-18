'use client';

import { User, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, UserCredential, updateCurrentUser, browserSessionPersistence, setPersistence } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import useFetchAgentData from "@/hooks/useFetchAgentData"; 


type AuthContextType = {
  user: User | null;
  detail: UserDetail | null;
  isLoading: boolean; // ✅ הוספה
  logIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string) => Promise<UserCredential>;
  logOut: () => Promise<void>;
}

type UserDetail = {
  name: string;
  email: string;
  agentId: string;
  role: 'agent' | 'worker'| 'admin' | 'manager';
};

// @ts-ignore
// export const AuthContext = createContext<AuthContextType>();

export const AuthContext = createContext<AuthContextType>({
  user: null,
  detail: null,
  isLoading: true, // ✅ חובה פה!
  logIn: async () => {
    throw new Error("logIn not implemented");
  },
  signUp: async () => {
    throw new Error("signUp not implemented");
  },
  logOut: async () => {
    throw new Error("logOut not implemented");
  },
});


export const AuthContextProvider = (props: any) => {
  const [user, setUser] = useState<User | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // const { resetSelectedAgentId } = useFetchAgentData();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
  
      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid);
        getDoc(docRef)
          .then((doc) => {
            const data = doc.data();
            setDetail(data as UserDetail);
            setIsLoading(false); // ✅ סיום טעינה
          });
      } else {
        setDetail(null);
        setIsLoading(false); // ✅ גם כאן!
      }
    });
  
    return () => unsubscribe();
  }, []);



  const logIn = async (email: string, password: string) => {
    return setPersistence(auth, browserSessionPersistence)
      .then(() => {
        return signInWithEmailAndPassword(auth, email, password);
      })
  };

  const signUp = async (email: string, password: string) => {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  const logOut = async () => {
    // resetSelectedAgentId(); // אפס את selectedAgentId ל-null
    return signOut(auth);
  };

  return (
    <AuthContext.Provider
      {...props}
      value={{ user, detail, isLoading, logIn, logOut, signUp }}
    />
  )
}

export function useAuth() {
  return useContext(AuthContext);
}
