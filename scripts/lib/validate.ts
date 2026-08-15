/**
 * Validering af rå Firestore-dokumenter mod Convex-validatorer.
 *
 * Validatorerne læses ud af convex/schema.ts på runtime, ikke skrevet af igen
 * i hånden. Det er hele pointen: en håndskrevet kopi ville drive fra schemaet,
 * og så ville revisionen svare på et spørgsmål vi ikke stillede.
 *
 * Convex-validatorer eksponerer deres struktur direkte:
 *   kind        "object" | "array" | "union" | "literal" | "record" | "id" |
 *               "string" | "float64" | "int64" | "boolean" | "null" | "any" | "bytes"
 *   isOptional  "required" | "optional"
 *   .fields     (object)   .element (array)   .members (union)
 *   .value      (literal)  .tableName (id)
 */

/** Minimal strukturel form af en Convex-validator. Nok til at gå den igennem. */
export type AnyValidator = {
  kind: string;
  isOptional: "required" | "optional";
  fields?: Record<string, AnyValidator>;
  element?: AnyValidator;
  members?: AnyValidator[];
  value?: unknown;
  tableName?: string;
};

export type Overtrædelse = {
  /** Sti ned i dokumentet, fx "promille.weight". */
  sti: string;
  /** Hvorfor det ikke passer. Aldrig med dataindhold. */
  årsag: string;
};

/**
 * Felter der findes i schemaet, men som IKKE kan komme fra Firestore-dataene,
 * fordi de er referencer Convex selv tildeler ved migreringen (Convex-id'er)
 * eller felter vi bevidst udleder. De springes over, så revisionen ikke
 * rapporterer dem som manglende i hvert eneste dokument.
 */
export type Undtagelser = {
  /** Feltstier der ikke skal kræves, fx ["activeChannelId"]. */
  ignorerManglende?: string[];
  /** Feltstier hvis type ikke skal tjekkes (typisk id-referencer). */
  ignorerType?: string[];
};

/**
 * Validerer ét dokument. Returnerer alle overtrædelser, ikke kun den første —
 * revisionen skal kunne tælle hvor udbredt hvert problem er.
 */
export function valider(
  doc: Record<string, unknown>,
  validator: AnyValidator,
  undtagelser: Undtagelser = {},
): Overtrædelse[] {
  const fund: Overtrædelse[] = [];
  gåIgennem(doc, validator, "", fund, undtagelser);
  return fund;
}

function gåIgennem(
  værdi: unknown,
  validator: AnyValidator,
  sti: string,
  fund: Overtrædelse[],
  undtagelser: Undtagelser,
): void {
  if (undtagelser.ignorerType?.includes(sti)) return;

  switch (validator.kind) {
    case "any":
      return;

    case "null":
      if (værdi !== null) fund.push({ sti, årsag: `forventede null, fik ${typeAf(værdi)}` });
      return;

    case "string":
      if (typeof værdi !== "string") {
        fund.push({ sti, årsag: `forventede string, fik ${typeAf(værdi)}` });
      }
      return;

    case "float64":
    case "int64":
      if (typeof værdi !== "number" || !Number.isFinite(værdi)) {
        fund.push({ sti, årsag: `forventede number, fik ${typeAf(værdi)}` });
      }
      return;

    case "boolean":
      if (typeof værdi !== "boolean") {
        fund.push({ sti, årsag: `forventede boolean, fik ${typeAf(værdi)}` });
      }
      return;

    case "id":
      // I Firestore er referencer strenge (dokument-id'er). Convex-id'er
      // tildeles først ved migreringen, så her kan vi kun kræve en streng.
      if (typeof værdi !== "string") {
        fund.push({
          sti,
          årsag: `forventede reference til "${validator.tableName}" som string, fik ${typeAf(værdi)}`,
        });
      }
      return;

    case "literal":
      if (værdi !== validator.value) {
        fund.push({
          sti,
          årsag: `forventede literalen ${JSON.stringify(validator.value)}, fik en anden værdi`,
        });
      }
      return;

    case "array": {
      if (!Array.isArray(værdi)) {
        fund.push({ sti, årsag: `forventede array, fik ${typeAf(værdi)}` });
        return;
      }
      if (validator.element === undefined) return;
      // Kun første afvigende element rapporteres per array, ellers ville ét
      // skævt dokument kunne drukne rapporten i identiske linjer.
      for (let i = 0; i < værdi.length; i++) {
        const før = fund.length;
        gåIgennem(værdi[i], validator.element, `${sti}[]`, fund, undtagelser);
        if (fund.length > før) return;
      }
      return;
    }

    case "object": {
      if (typeof værdi !== "object" || værdi === null || Array.isArray(værdi)) {
        fund.push({ sti, årsag: `forventede objekt, fik ${typeAf(værdi)}` });
        return;
      }
      const obj = værdi as Record<string, unknown>;
      for (const [navn, feltValidator] of Object.entries(validator.fields ?? {})) {
        const feltSti = sti === "" ? navn : `${sti}.${navn}`;
        const findes = obj[navn] !== undefined;

        if (!findes) {
          if (
            feltValidator.isOptional !== "optional" &&
            !undtagelser.ignorerManglende?.includes(feltSti)
          ) {
            fund.push({ sti: feltSti, årsag: "påkrævet felt mangler" });
          }
          continue;
        }
        gåIgennem(obj[navn], feltValidator, feltSti, fund, undtagelser);
      }
      return;
    }

    case "union": {
      // Passer værdien nogen af grenene, er den gyldig.
      for (const gren of validator.members ?? []) {
        const prøve: Overtrædelse[] = [];
        gåIgennem(værdi, gren, sti, prøve, undtagelser);
        if (prøve.length === 0) return;
      }
      fund.push({
        sti,
        årsag: `passer ingen af unionens ${validator.members?.length ?? 0} grene`,
      });
      return;
    }

    case "record":
      if (typeof værdi !== "object" || værdi === null || Array.isArray(værdi)) {
        fund.push({ sti, årsag: `forventede record-objekt, fik ${typeAf(værdi)}` });
      }
      return;

    default:
      // Ukendt validator-art: rapportér frem for at antage at alt er fint.
      fund.push({ sti, årsag: `ukendt validator-art "${validator.kind}"` });
  }
}

/** Typenavn til fejlbeskeder. Returnerer ALDRIG selve værdien. */
function typeAf(værdi: unknown): string {
  if (værdi === null) return "null";
  if (værdi === undefined) return "undefined";
  if (Array.isArray(værdi)) return "array";
  return typeof værdi;
}

/** Feltnavne i et objekt-validator — bruges til at finde ukendte felter i data. */
export function kendteFelter(validator: AnyValidator): Set<string> {
  return new Set(Object.keys(validator.fields ?? {}));
}
