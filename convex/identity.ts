import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { erAdminEmail } from "./constants";

/**
 * Identitet og adgangskontrol.
 *
 * Identiteten kommer fra det Firebase-JWT som Convex har verificeret — aldrig
 * fra klientens argumenter. Før fase 3 tog hver mutation `userId` som
 * parameter, hvilket lod enhver klient handle som en vilkårlig bruger.
 *
 * Koblingen er `users.authId` = tokenets `sub`-claim = Firebase UID.
 *
 * MIGRERING (senere fase, ikke nu): når brugerne flyttes fra det gamle
 * Firestore-projekt, SKAL `users.authId` sættes til det Firebase UID brugeren
 * allerede har (dokument-id'et i den gamle /users-collection var netop dette
 * UID). Så matcher login automatisk, og ingen bruger skal gøre noget.
 */

export type Ctx = QueryCtx | MutationCtx;

/** Firebase UID for den kaldende bruger, eller null hvis ikke logget ind. */
export async function getAuthId(ctx: Ctx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  // `subject` er tokenets `sub`-claim — Firebase UID.
  return identity.subject;
}

/**
 * Den indloggede brugers profil, eller null.
 *
 * Null betyder to forskellige ting, som kalderen skal kunne skelne: enten er
 * der ingen session, eller også er brugeren logget ind uden endnu at have
 * oprettet en profil (mellem signup og createUser).
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const authId = await getAuthId(ctx);
  if (authId === null) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_auth_id", (q) => q.eq("authId", authId))
    .unique();
}

/** Som getCurrentUser, men kaster hvis der ikke er en profil. */
export async function requireCurrentUser(ctx: Ctx): Promise<Doc<"users">> {
  const authId = await getAuthId(ctx);
  if (authId === null) {
    throw new ConvexError({
      code: "NOT_AUTHENTICATED",
      message: "Du skal være logget ind.",
    });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_id", (q) => q.eq("authId", authId))
    .unique();

  if (user === null) {
    throw new ConvexError({
      code: "NO_PROFILE",
      message:
        "Du er logget ind, men har ingen profil endnu. Kald users.createUser først.",
    });
  }

  return user;
}

/**
 * Kræver admin.
 *
 * To veje ind, og de gælder begge:
 *   - `isAdmin` på brugerdokumentet. Sættes manuelt i Convex-dashboardet —
 *     aldrig af brugeren selv.
 *   - Emailen står i ADMIN_EMAILS (convex/constants.ts). Den vej er skrevet
 *     ned i koden, så et nyt deployment ikke starter helt uden en admin.
 *
 * Emailen kommer fra brugerdokumentet, som blev fyldt ud fra det verificerede
 * Firebase-token ved oprettelsen — den kan altså ikke sættes af klienten.
 */
export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireCurrentUser(ctx);
  if (user.isAdmin !== true && !erAdminEmail(user.email)) {
    console.log("[Auth] admin-adgang nægtet", { userId: user._id });
    throw new ConvexError({
      code: "NOT_ADMIN",
      message: "Handlingen kræver administratorrettigheder.",
    });
  }
  return user;
}

/**
 * Kræver at den indloggede bruger er medlem af Kanalen.
 * Admins slipper IKKE automatisk igennem — det skal være et bevidst valg
 * det enkelte sted, ikke en generel bagdør til alle kanalers data.
 */
export async function requireKanalMedlem(
  ctx: Ctx,
  channelId: Id<"kanaler">,
): Promise<{ user: Doc<"users">; kanal: Doc<"kanaler"> }> {
  const user = await requireCurrentUser(ctx);

  const kanal = await ctx.db.get(channelId);
  if (kanal === null) {
    throw new ConvexError({
      code: "KANAL_NOT_FOUND",
      message: "Kanalen findes ikke.",
    });
  }

  if (!user.joinedChannelIds.includes(channelId)) {
    console.log("[Auth] kanal-adgang nægtet", {
      userId: user._id,
      kanal: kanal.name,
    });
    throw new ConvexError({
      code: "NOT_A_MEMBER",
      message: `Du er ikke medlem af "${kanal.name}".`,
    });
  }

  return { user, kanal };
}

/**
 * Kræver at den indloggede bruger må se `targetUserId`s data.
 *
 * Tilladt hvis det er en selv, eller hvis man deler mindst én Kanal med den
 * anden bruger — scoreboard og kanal-log viser i forvejen hinandens tal, så
 * det ville være meningsløst at spærre for det. Fremmede er spærret ude.
 */
export async function requireCanViewUser(
  ctx: Ctx,
  targetUserId: Id<"users">,
): Promise<{ viewer: Doc<"users">; target: Doc<"users"> }> {
  const viewer = await requireCurrentUser(ctx);

  if (viewer._id === targetUserId) {
    return { viewer, target: viewer };
  }

  const target = await ctx.db.get(targetUserId);
  if (target === null) {
    throw new ConvexError({
      code: "USER_NOT_FOUND",
      message: "Brugeren findes ikke.",
    });
  }

  const deltKanal = target.joinedChannelIds.some((channelId) =>
    viewer.joinedChannelIds.includes(channelId),
  );

  if (!deltKanal) {
    console.log("[Auth] bruger-opslag nægtet", {
      viewer: viewer._id,
      target: targetUserId,
    });
    throw new ConvexError({
      code: "NOT_VISIBLE",
      message: "Du deler ingen Kanal med denne bruger.",
    });
  }

  return { viewer, target };
}
