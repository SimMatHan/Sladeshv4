import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Det sidste værn: en fejl under tegningen må ikke efterlade en blank skærm.
 *
 * `useQuery` kaster serverens fejl videre ind i React, og uden en grænse
 * river én kastet fejl hele appen ned — også opstartsskærmen og
 * statusbjælken. Tilbage står en tom side uden en eneste knap, og i en
 * installeret PWA er der ingen genindlæs-knap i browseren at falde tilbage
 * på. Det er præcis dét, nye brugere ramte, da skallen blev tegnet, før
 * deres profil fandtes.
 *
 * Den RETTER ikke noget — den sørger for, at man kan komme videre. Fejlen
 * logges, så den kan findes, og skærmen siger, hvad man gør.
 *
 * En klasse, fordi React kun kan fange fejl under tegning i en klasse-
 * komponent. Der findes ingen hook til det.
 */
export class Fejlgraense extends Component<
  { children: ReactNode },
  { fejl: Error | undefined }
> {
  state: { fejl: Error | undefined } = { fejl: undefined };

  static getDerivedStateFromError(fejl: Error) {
    return { fejl };
  }

  componentDidCatch(fejl: Error, info: ErrorInfo) {
    console.error("[UI] appen faldt under tegningen", fejl, info.componentStack);
  }

  render() {
    if (this.state.fejl === undefined) return this.props.children;

    return (
      <div className="fejlgraense" role="alert">
        <div className="stortikon" aria-hidden="true">
          🍺
        </div>
        <h1>Noget gik galt</h1>
        <p className="under">
          Appen løb ind i en fejl. Genstart den, så plejer det at gå.
        </p>
        <button
          className="knap primaer"
          onClick={() => window.location.reload()}
        >
          Genstart appen
        </button>
      </div>
    );
  }
}
