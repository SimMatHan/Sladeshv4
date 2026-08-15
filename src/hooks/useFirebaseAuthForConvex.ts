import { useCallback, useEffect, useState } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";

/**
 * Broen mellem Firebase Auth og Convex.
 *
 * `ConvexProviderWithAuth` forventer præcis denne form. Convex kalder selv
 * `fetchAccessToken` når den har brug for et token — både ved forbindelse og
 * når et token er ved at udløbe — så vi skal ikke selv skubbe tokens ind.
 *
 * `onIdTokenChanged` (ikke `onAuthStateChanged`) er det rigtige abonnement
 * her: den fyrer både ved login/logout OG hver gang Firebase fornyr ID-tokenet,
 * hvilket sker ca. hvert 55. minut. Med `onAuthStateChanged` ville vi ikke
 * opdage fornyelsen, og Convex kunne ende med at holde på et udløbet token.
 */
export function useFirebaseAuthForConvex(): {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: {
    forceRefreshToken: boolean;
  }) => Promise<string | null>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (nextUser) => {
      console.log("[Auth] token-tilstand ændret", {
        indlogget: nextUser !== null,
        uid: nextUser?.uid,
      });
      setUser(nextUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const currentUser = auth.currentUser;
      if (currentUser === null) return null;

      try {
        // `forceRefreshToken` sættes af Convex når det gamle token er ved at
        // udløbe — så skal Firebase tvinges til at hente et nyt frem for at
        // returnere det cachede.
        return await currentUser.getIdToken(forceRefreshToken);
      } catch (error) {
        console.error("[Auth] kunne ikke hente ID-token", error);
        return null;
      }
    },
    // Uden `user` i afhængighederne ville Convex holde fast i den allerførste
    // udgave af callbacken og ikke opdage et skift af bruger.
    [user],
  );

  return {
    isLoading,
    isAuthenticated: user !== null,
    fetchAccessToken,
  };
}
