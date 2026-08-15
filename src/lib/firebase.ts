import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

/**
 * Firebase — KUN Authentication.
 *
 * Databasen er Convex. Der importeres bevidst hverken `firebase/firestore`,
 * `firebase/functions` eller `firebase/storage` her, og det skal forblive
 * sådan: Firestore er den datakilde vi er ved at migrere væk fra, og en
 * enkelt import ville gøre det let at falde tilbage til den ved et uheld.
 *
 * Firebase beholdes udelukkende fordi de eksisterende brugerkonti ligger der.
 * Convex verificerer de JWT'er Firebase udsteder — se convex/auth.config.ts.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Fejl højlydt, men uden at vælte bundlet, når .env ikke er udfyldt.
// `initializeApp` accepterer glad undefined-værdier, hvorefter hvert eneste
// auth-kald fejler — det ligner flere uafhængige fejl frem for én manglende
// konfiguration. Samme mønster som i det gamle repo.
const missingConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfigKeys.length > 0) {
  console.error("[Auth] Firebase-config er ufuldstændig — login vil fejle", {
    manglende: missingConfigKeys,
  });
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/**
 * Projekt-id'et som Convex forventer i tokenets `aud`-claim. Eksporteres, så
 * en fejlkonfiguration kan opdages i frontenden frem for kun at vise sig som
 * "unauthenticated" fra Convex.
 */
export const firebaseProjectId = firebaseConfig.projectId;
