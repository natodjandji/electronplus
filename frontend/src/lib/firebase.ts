import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Must stay electronplus-ve.firebaseapp.com — that's the only domain
  // registered as an authorized redirect URI on the Google OAuth client.
  // Switching this to our own Hosting domain (e.g. to have the Google
  // sign-in popup/redirect's brief stop on /__/auth/handler pick up our
  // favicon instead of Firebase's default one) breaks sign-in entirely
  // with a redirect_uri_mismatch until that URI is added in Google Cloud
  // Console's Credentials page — which isn't reachable via any API, so
  // don't change this without doing that first.
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
