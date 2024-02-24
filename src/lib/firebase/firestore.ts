import { getFirestore } from 'firebase/firestore';
import { app } from './firebase';

// Initialize Firestore
const db = getFirestore(app);

export { db };