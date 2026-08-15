import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

/**
 * Login-flow.
 *
 * Samme to metoder som det gamle repo brugte: email/adgangskode og Google via
 * popup. Ingen andre providere, så eksisterende brugere kan logge ind præcis
 * som før.
 *
 * Til forskel fra det gamle repo oprettes brugerprofilen IKKE her. Firebase
 * står kun for identiteten; profilen ligger i Convex og oprettes med
 * `users.createUser`, som selv læser identiteten ud af tokenet.
 */

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        console.log("[Auth] login-tilstand", {
          indlogget: nextUser !== null,
          email: nextUser?.email,
        });
        setUser(nextUser);
        setLoading(false);
        setError(null);
      },
      (authError) => {
        console.error("[Auth] fejl i login-tilstand", authError);
        setError(authError.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("[Auth] logget ind med adgangskode");
    } catch (err) {
      const message = getAuthErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      console.log("[Auth] konto oprettet");
    } catch (err) {
      const message = getAuthErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      console.log("[Auth] logget ind med Google");
    } catch (err) {
      const message = getAuthErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await firebaseSignOut(auth);
    console.log("[Auth] logget ud");
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, signIn, signUp, signInWithGoogle, signOut }),
    [user, loading, error, signIn, signUp, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth skal bruges inde i en <AuthProvider>");
  }
  return context;
}

/** Danske beskeder for de fejlkoder brugeren realistisk kan ramme. */
function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "Ugyldig emailadresse.";
    case "auth/user-disabled":
      return "Kontoen er deaktiveret.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Forkert email eller adgangskode.";
    case "auth/email-already-in-use":
      return "Der findes allerede en konto med denne email.";
    case "auth/weak-password":
      return "Adgangskoden skal være mindst 6 tegn.";
    case "auth/popup-closed-by-user":
      return "Google-login blev afbrudt.";
    case "auth/too-many-requests":
      return "For mange forsøg. Prøv igen om lidt.";
    default:
      return "Der skete en fejl. Prøv igen.";
  }
}
