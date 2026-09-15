import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { LogBox } from 'react-native';

// Suppress benign Firestore WebChannel & Auth persistence warnings in React Native
setLogLevel('error');
LogBox.ignoreLogs([
  '@firebase/firestore:',
  '@firebase/auth:',
  "WebChannelConnection RPC 'Listen' stream",
  'transport errored',
  'AsyncStorage has been extracted',
  'Setting a timer for a long period of time',
]);

const config = {
  apiKey: "AIzaSyANHu4n9V3rtlbKOITBCdiUfT8qHyd-Cv0",
  authDomain: "zentiq-b5d40.firebaseapp.com",
  projectId: "zentiq-b5d40",
  storageBucket: "zentiq-b5d40.firebasestorage.app",
  messagingSenderId: "756831335543",
  appId: "1:756831335543:web:1ada637eaa91dd2c870272",
  measurementId: "G-RJY1DGXFEZ"
};

const app = !getApps().length ? initializeApp(config) : getApp();

// Initialize Firebase Auth with AsyncStorage persistence to avoid NO_PERSISTENCE_WARNING
let auth: any;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

// Use initializeFirestore with experimentalForceLongPolling for stable React Native networking
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

const storage = getStorage(app);

export { app, auth, db, storage };
