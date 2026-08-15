import { useState, type FormEvent } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "./contexts/AuthContext";

/**
 * Minimal login-skal.
 *
 * Fase 3 leverer kun det UI der skal til for at kunne logge ind og bekræfte
 * at Convex accepterer Firebase-tokenet. Den rigtige app-UI kommer senere.
 */
export default function App() {
  const { user, loading, error, signOut } = useAuth();
  // `useConvexAuth` fortæller om CONVEX har accepteret tokenet — ikke blot om
  // Firebase har en session. De to kan afvige, fx hvis auth.config.ts peger på
  // et forkert projekt-id, og så er det præcis her det skal kunne ses.
  const { isAuthenticated, isLoading: convexLoading } = useConvexAuth();

  if (loading) return <main><p>Indlæser…</p></main>;

  if (user === null) {
    return (
      <main>
        <h1>SladeshApp</h1>
        <LoginForm />
        {error !== null && <p role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>SladeshApp</h1>
      <p>Logget ind som {user.email}</p>
      <p>
        Convex-session:{" "}
        {convexLoading
          ? "verificerer…"
          : isAuthenticated
            ? "godkendt ✓"
            : "AFVIST — tjek auth.config.ts og VITE_FIREBASE_PROJECT_ID"}
      </p>
      {isAuthenticated && !convexLoading && <Profil />}
      <button onClick={() => void signOut()}>Log ud</button>
    </main>
  );
}

function LoginForm() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (mode === "signIn") await signIn(email, password);
      else await signUp(email, password);
    } catch {
      // Fejlbeskeden vises via AuthContext.error.
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Adgangskode
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit">
        {mode === "signIn" ? "Log ind" : "Opret konto"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
      >
        {mode === "signIn" ? "Opret en konto i stedet" : "Jeg har allerede en konto"}
      </button>
      <button type="button" onClick={() => void signInWithGoogle()}>
        Log ind med Google
      </button>
    </form>
  );
}

/** Viser Convex-profilen, og tilbyder at oprette den hvis den mangler. */
function Profil() {
  const me = useQuery(api.users.getMe);
  const createUser = useMutation(api.users.createUser);

  if (me === undefined) return <p>Henter profil…</p>;

  if (me === null) {
    return (
      <div>
        <p>Du har ingen profil i Convex endnu.</p>
        <button onClick={() => void createUser({})}>Opret profil</button>
      </div>
    );
  }

  return (
    <p>
      Profil: {me.displayName} — {me.totalPoints ?? 0} point, stræk{" "}
      {me.currentDayStreak ?? 0}
    </p>
  );
}
