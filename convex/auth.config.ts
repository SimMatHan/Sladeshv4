/**
 * Convex accepterer JWT'er udstedt af Firebase Authentication.
 *
 * Vi bruger IKKE Convex Auth-biblioteket. Firebase udsteder allerede JWT'er
 * til de eksisterende brugerkonti, og ved at lade Convex verificere dem
 * bevares alle konti 1:1 — ingen bruger skal oprettes eller nulstille kode.
 *
 * Firebase udstiller et OIDC discovery-dokument på
 *   https://securetoken.google.com/<projectId>/.well-known/openid-configuration
 * så Convex selv kan hente de offentlige nøgler (JWKS) og validere signaturen.
 * Derfor bruges OIDC-formen `{ domain, applicationID }` frem for `customJwt`,
 * hvor man skulle indsætte JWKS manuelt.
 *
 * I det verificerede tokens claims gælder:
 *   iss = https://securetoken.google.com/<projectId>   → matcher `domain`
 *   aud = <projectId>                                  → matcher `applicationID`
 *   sub = Firebase UID                                 → gemmes som users.authId
 *
 * VIGTIGT om env-variablen: denne fil køres af Convex-deploymentet, ikke af
 * Vite. `import.meta.env` findes ikke her. Variablen skal derfor sættes
 * SEPARAT på deploymentet, selvom den hedder det samme som klientens:
 *
 *   npx convex env set VITE_FIREBASE_PROJECT_ID sladeshultimate-1
 *
 * Den lokale .env / .env.local dækker kun frontenden.
 */

const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

if (!projectId) {
  // Fejl højlydt ved deploy frem for at deploye en konfiguration der afviser
  // hvert eneste token. Uden dette ville symptomet være at ALT fejler som
  // "unauthenticated", hvilket ligner en fejl i login-flowet frem for en
  // manglende variabel på deploymentet.
  throw new Error(
    "[Auth] VITE_FIREBASE_PROJECT_ID mangler på Convex-deploymentet. " +
      "Kør: npx convex env set VITE_FIREBASE_PROJECT_ID <dit-firebase-projekt-id>",
  );
}

export default {
  providers: [
    {
      domain: `https://securetoken.google.com/${projectId}`,
      applicationID: projectId,
    },
  ],
};
