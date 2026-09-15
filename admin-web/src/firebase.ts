import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const config = {
  apiKey: "AIzaSyANHu4n9V3rtlbKOITBCdiUfT8qHyd-Cv0",
  authDomain: "zentiq-b5d40.firebaseapp.com",
  projectId: "zentiq-b5d40",
  storageBucket: "zentiq-b5d40.firebasestorage.app",
  messagingSenderId: "756831335543",
  appId: "1:756831335543:web:1ada637eaa91dd2c870272",
  measurementId: "G-RJY1DGXFEZ"
};

export const app = !getApps().length ? initializeApp(config) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
