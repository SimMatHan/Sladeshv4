import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithAuth } from "convex/react";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { useFirebaseAuthForConvex } from "./hooks/useFirebaseAuthForConvex.ts";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!convexUrl) {
  console.error(
    "[Setup] VITE_CONVEX_URL mangler. Kør `npx convex dev` for at oprette " +
      "og forbinde Convex-projektet — den skriver .env.local automatisk.",
  );
  throw new Error("[Setup] VITE_CONVEX_URL er ikke sat");
}

console.log("[Convex] forbinder til deployment", { url: convexUrl });

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* AuthProvider styrer login-flowet; ConvexProviderWithAuth henter selv
        Firebase-tokenet gennem broen og forsyner hvert Convex-kald med det. */}
    <AuthProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useFirebaseAuthForConvex}>
        <App />
      </ConvexProviderWithAuth>
    </AuthProvider>
  </StrictMode>,
);
