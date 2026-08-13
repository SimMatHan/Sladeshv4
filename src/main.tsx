import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App.tsx";

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
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
);
