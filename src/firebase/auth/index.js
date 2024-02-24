import { getAuth, createUserWithEmailAndPassword as createUserWithEmail } from "firebase/auth";

export const createUserWithEmailAndPassword = (email, password) => {
  const auth = getAuth();
  return createUserWithEmail(auth, email, password);
};

