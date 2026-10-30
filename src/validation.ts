// Validation commune des champs texte recus dans le corps des requetes.
// Sans elle, un objet ou un tableau passe le test "!champ" et finit stocke puis diffuse tel quel.

export interface RegleTexte {
  /** Longueur maximale, en caracteres apres trim (en octets pour un mot de passe). */
  max: number;
  /** Longueur minimale, 1 par defaut : un texte vide apres trim est toujours refuse. */
  min?: number;
  /**
   * Mot de passe : refuse s'il est vide apres trim, mais garde tel quel (les espaces en font
   * partie), et borne en octets car bcrypt ignore tout ce qui depasse 72 octets.
   */
  motDePasse?: boolean;
}

// Longueurs communes a toutes les routes
export const NOM = { max: 50 } satisfies RegleTexte;
export const EMAIL = { max: 254 } satisfies RegleTexte;
export const CONTENU_MESSAGE = { max: 1000 } satisfies RegleTexte;
// Au-dela de 72 octets, bcrypt accepterait l'un pour l'autre deux mots de passe de meme debut
export const MOT_DE_PASSE = { min: 8, max: 72, motDePasse: true } satisfies RegleTexte;

function messageInvalide(champ: string, regle: RegleTexte): string {
  const min = regle.min ?? 1;
  if (regle.motDePasse) return `${champ} doit etre un texte de ${min} caracteres minimum et ${regle.max} octets maximum`;
  return min > 1
    ? `${champ} doit etre un texte de ${min} a ${regle.max} caracteres`
    : `${champ} doit etre un texte non vide de ${regle.max} caracteres maximum`;
}

/**
 * Lit et valide plusieurs champs texte du corps. Renvoie les valeurs nettoyees (trim),
 * ou le message d'erreur du premier champ invalide, a renvoyer en 400.
 */
export function lireTextes<C extends string>(
  corps: unknown,
  regles: Record<C, RegleTexte>
): { valeurs: Record<C, string> } | { erreur: string } {
  const source = (typeof corps === 'object' && corps !== null ? corps : {}) as Record<string, unknown>;
  const valeurs = {} as Record<C, string>;

  for (const champ of Object.keys(regles) as C[]) {
    const regle = regles[champ];
    const brut = source[champ];
    if (typeof brut !== 'string' || brut.trim() === '') {
      return { erreur: messageInvalide(champ, regle) };
    }

    const valeur = regle.motDePasse ? brut : brut.trim();
    const longueur = regle.motDePasse ? Buffer.byteLength(valeur, 'utf8') : valeur.length;
    if (valeur.length < (regle.min ?? 1) || longueur > regle.max) {
      return { erreur: messageInvalide(champ, regle) };
    }
    valeurs[champ] = valeur;
  }

  return { valeurs };
}
