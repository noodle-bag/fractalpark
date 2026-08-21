# Manuel d’auteur FRM-like v1

- Locale: fr
- Source manual SHA-256: e5168f1a0211596659314d748fa53825892a2a6f089350e636a8c0baf3903758
- Traduction candidate générée par IA ; le statut des revues technique, locale et de maintenance est suivi en dehors de ce document.
- Langue: FractalPark FRM-like Language v1 (`frm-like/1`)
- Date: 2026-08-20
- Référence normative (en anglais, faisant autorité): [FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)
- Formula Records: `/fr/formulas/<formulaId>` sur FractalPark

Ce manuel enseigne le langage en lisant et en modifiant de petites Definitions.
Les formules Standard publiées utilisent aujourd’hui ce langage. L’activation du
writer/importateur v1 canonique reste soumise à un gate.

## 1. Ce que tu peux faire aujourd’hui

FractalPark expose actuellement 677 identités Standard : 513 Definitions publiées
et 164 Records maintenus hors publication.

Pour un Record publié, tu peux :

- examiner son identité, sa provenance, sa décision relative aux droits, sa révision de source et son Profile ;
- afficher ou télécharger la source de la Definition `.frm` épinglée ;
- ouvrir la Definition et le Profile épinglés dans Explore ; et
- lancer un Remix anonyme sans modifier la source Standard.

Un Record maintenu hors publication explique pourquoi il n’est pas disponible. Il n’a aucune action
de source, d’exécution, de modification ou de Remix. La présence au catalogue ne
signifie pas une disponibilité à l’exécution.

L’Éditeur FRM autonome reste une surface d’auteur compatible Classic.
L’activation du writer et de l’importateur FRM-like v1 canoniques reste
bloquée. Les exemples de ce manuel sont des Definitions v1 exécutables,
vérifiées avec l’analyseur v1 de production, la génération d’artefacts CPU/GLSL
et deux étapes CPU finies, mais l’Éditeur autonome actuel n’est pas une cible de
collage v1 canonique. Utilise les Formula Records pour examiner la source Standard
active ; utilise le FRM Guide existant pour le flux de travail de l’Éditeur
compatible Classic.

## 2. Lire une Definition publiée

Une Definition publiée commence par trois directives sémantiques :

```text
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

Elles fixent le langage, le vocabulaire de fonctions et le comportement numérique.
Elles ressemblent à des commentaires afin que les lecteurs Classic puissent les
tolérer, mais FractalPark les traite comme une entrée sémantique. En supprimer,
en dupliquer une, en placer une après l’en-tête de formule ou en modifier une
invalide la Definition. Réordonner les trois directives dans le préambule est
valide ; la sortie canonique rétablit l’ordre présenté ci-dessus.

La source migrée peut aussi porter une directive facultative
`; @classic-guards: zero-division, floored-log, hyperbolic-clamp`.
La sortie canonique la place immédiatement après `@numeric-profile`. Elle consigne
des éléments de compatibilité examinés ; les auteurs ne DOIVENT donc PAS l’ajouter,
la supprimer ou la modifier à la main ; voir [§5 normative](../specs/frm-like-language-v1.md#5-standard-library-v1).

Le corps comporte un nom de formule et trois sections exécutables obligatoires :

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
FirstOrbit {
  init:
    z = 0
  loop:
    z = z ^ 2 + c
  bailout:
    |z| <= 4
}
```

Ici, `|z| <= 4` signifie un rayon de 4. Un seuil Classic de magnitude au carré
de `4` correspond à `|z| <= 2` ; la migration doit donc traduire le sens au lieu
de copier le nombre.

Le moins unaire diffère aussi de la lecture courante et Classic où `^` est lu en
premier : v1 lit `-z ^ 2` comme `(-z) ^ 2`. Lors d’une migration, ajoute les
parenthèses qui expriment le signe voulu au lieu de copier une écriture ambiguë.

Lis-la dans l’ordre des itérations :

1. `init` fixe l’état de l’orbite une fois pour chaque pixel.
2. Avant chaque `loop`, FractalPark enregistre `z` comme `zPrev`.
3. `loop` met à jour l’orbite dans l’ordre de la source.
4. `bailout` répond à « l’itération doit-elle continuer ? » Un résultat faux l’arrête.

`|z|` est la véritable magnitude complexe, et non la magnitude au carré.
L’exemple continue donc tant que le rayon de l’orbite est au plus 4.

Un Formula Record épingle la source exacte par `sourceRevision` et épingle
séparément un Profile. Le Profile possède la caméra, les itérations, le mode, la
constante Julia, la palette et la coloration. Ces choix de présentation
n’appartiennent pas à la Definition.

## 3. Écrire une Definition

Commence par la plus petite structure ci-dessus. Les noms de formule et les
variables utilisent des lettres ASCII, des chiffres et des soulignements ; le
premier caractère ne peut pas être un chiffre. Garde une instruction par ligne
physique.

Les valeurs système et hôte utiles sont :

- `pixel` : la coordonnée actuelle du plan ;
- `c` : la constante de formule sélectionnée à l’exécution ;
- `z` : l’état d’orbite modifiable ;
- `zPrev` : la valeur d’orbite de l’itération précédente maintenue par l’exécution ;
- `LastSqr` : la magnitude au carré de `z`, maintenue par l’exécution à la fin du
  `loop` achevé le plus récemment. Pour un `z` fini dont la magnitude au carré dépasse
  binary32, ce canal de décision sature à l’infini positif sans terminer l’étape ;
  lire cette valeur dans la source produit toujours `nonFinite` ;
- `ismand` : le mode plan de paramètres (`true`) par opposition au mode Julia (`false`) ;
- `pi`, `e` et `maxit` ;
- les entrées d’interopérabilité Classic `p1`-`p5`, lisibles directement. Un
  emplacement non lié vaut zéro complexe sur CPU et DOIT rester zéro complexe dans
  un hôte GLSL conforme. Une liaison `classic pN` fait résoudre l’emplacement nu et
  le paramètre nommé vers la même valeur ; et
- les emplacements de fonction Classic `fn1`-`fn4`, qui exigent des paramètres de
  fonction nommés correspondants avec des liaisons `classic fnN` avant de pouvoir être appelés.

`zPrev` et `LastSqr` ne sont pas des entrées hôte externes et ne DOIVENT PAS être
remplacés. Consulte la [référence rapide de la bibliothèque standard](#standard-library-quick-reference)
pour les fonctions disponibles dans les expressions d’état.

Cette Definition fonctionne à la fois en modes plan de paramètres et Julia :

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
ModeAwarePower {
  parameters:
    power: real = 2 domain [1, 16]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = z ^ power + c
  bailout:
    |z| <= 64
}
```

N’assigne aucune valeur système ou aucun emplacement Classic énuméré au §3, aucun
paramètre, aucune constante ni aucun nom de stdlib. `z` est la seule valeur système
inscriptible. Un nouveau nom d’assignation légal crée une variable locale, mais les
assignations suivantes doivent garder le même type.

Les expressions prennent en charge l’arithmétique, la comparaison, les opérateurs
logiques, le moins unaire et not, les appels de fonction, les parenthèses, les
littéraux complexes et les barres de magnitude. `^` est associatif à droite.
FractalPark évalue dans l’ordre de la source et de gauche à droite au lieu de
réorganiser silencieusement le travail en virgule flottante. La forme du formateur
v1 canonique ne DOIT PAS imbriquer les barres de magnitude ; utilise `cabs(...)`
pour le module intérieur. Le moins unaire se lie plus étroitement que
l’exponentiation : `-z ^ 2` signifie `(-z) ^ 2`.

## 4. Ajouter des paramètres

Place une section `parameters` facultative avant `init`. Un paramètre a l’un des
trois types suivants :

- `real` : scalaire fini, facultativement avec `domain [min, max]` inclusif ;
- `complex` : valeur par défaut littérale `(real, imaginary)` ; ou
- `function` : nom d’une fonction stdlib unaire.

Un paramètre nommé peut enregistrer une liaison Classic unique. Lie les paramètres
`real` ou `complex` uniquement à `p1`-`p5`, et les paramètres de fonction uniquement
à `fn1`-`fn4`. Les liaisons facilitent la migration et l’interopérabilité ; ta source
doit utiliser le paramètre nommé.

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
FunctionGarden {
  parameters:
    scale: real = 0.5 domain [0, 2] classic p1
    offset: complex = (-0.2, 0.1) classic p2
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = transform(z) * scale + offset + c / maxit
  bailout:
    LastSqr < 576
}
```

Les domaines stricts sont des limites sémantiques validées. Si des valeurs hors
d’une plage suggérée restent valides, place plutôt cette plage souple dans le
Profile ou le Record.

Les paramètres de fonction acceptent des noms stdlib unaires tels que `sqr`,
`sin`, `log` ou `identity`. `atan2` a deux arguments et ne peut pas être choisi
comme paramètre de fonction. Si `real`, `imag` ou `cabs` est sélectionné, son
résultat scalaire est promu en valeur complexe avec une composante imaginaire nulle.
L’exemple utilise aussi la magnitude au carré maintenue à l’exécution `LastSqr`
comme seuil de continuation et le plafond d’itérations hôte `maxit` pour mettre à
l’échelle la contribution de `c`. Consulte la [référence rapide de la bibliothèque standard](#standard-library-quick-reference)
pour l’ensemble sélectionnable complet.

## 5. Utiliser l’état et le flux de contrôle

`if`, `elseif`, `else` et `endif` opèrent sur des conditions booléennes. Une
variable locale ne peut être lue après une branche que si chaque chemin l’a
initialisée. Cela rejette les formules qui dépendraient de valeurs périmées ou
spécifiques à un backend.

L’assignation d’un composant met à jour une partie d’une valeur complexe déjà
initialisée :

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
OrbitMemory {
  parameters:
    feedback: complex = (0.3, -0.12)
    bias: real = 0.05 domain [-1, 1]
  init:
    z = pixel
  loop:
    z = z + zPrev * feedback
    previous = z
    if real(z) >= 0
      z = sqr(z) + c
      real(z) = real(z) + bias
    else
      z = cos(z) + c
      imag(z) = imag(z) - bias
    endif
    z = z + bias * previous
  bailout:
    |z| < 48
}
```

Ici, `previous` est capturé après la mise à jour initiale de rétroaction et avant
la branche, tandis que `zPrev` est l’instantané d’exécution pris immédiatement
avant `loop`. Ils ne sont pas interchangeables : `zPrev` est la valeur d’orbite
entrante, tandis que `previous` est la valeur intermédiaire utilisée après la branche.

<a id="standard-library-quick-reference"></a>
### Référence rapide de la bibliothèque standard

La stdlib comprend :

- arithmétique et projections : `abs`, `sqr`, `sqrt`, `exp`, `log`, `recip`,
  `conj`, `flip`, `real`, `imag`, `cabs`, `round`, `atan2`, `identity` ;
- fonctions circulaires : `sin`, `cos`, `tan`, `asin`, `acos`, `atan` ; et
- fonctions hyperboliques : `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`,
  `cotanh`, plus la fonction de compatibilité `cosxx`.

Souviens-toi que `abs(z)` est appliqué composante par composante, tandis que
`cabs(z)` et `|z|` renvoient le module complexe. La division par zéro, `log(0)`
et les autres valeurs non finies requises se terminent par l’événement `nonFinite`,
sauf si une Definition migrée porte une protection Classic précise et étayée.

## 6. Diagnostiquer une Definition rejetée

Commence par la première raison stable. Les erreurs suivantes sont souvent des
conséquences de la même section manquante, du même jeton erroné ou de la même
valeur non déclarée.

Un ordre de vérification pratique est :

1. **Préambule :** les trois directives requises sont présentes une fois et avant
   l’en-tête ; conserve toute directive facultative examinée `@classic-guards` inchangée.
2. **Forme :** une formule ; `parameters`, `init`, `loop`, `bailout` dans cet ordre ;
   exactement une expression de bailout ; aucun texte exécutable final.
3. **Noms :** identifiants ASCII, aucune collision avec un nom réservé, aucun paramètre
   ni aucune liaison Classic en double.
4. **Types :** conditions booléennes de branche/bailout, fonctions appelables, type local
   cohérent, cible de composant initialisée.
5. **Assignation définie :** chaque lecture locale est initialisée sur chaque chemin.
6. **Sécurité :** la source, les paramètres, les variables locales, l’AST, la profondeur
   d’expression, les instructions, le flux de contrôle et le shader généré restent dans
   l’enveloppe v1.
7. **Exécution après acceptation :** une formule syntaxiquement valide peut encore se
   terminer par `nonFinite` ; c’est un élément d’exécution, pas l’autorisation de remplacer
   la formule.

Corrections courantes :

| Rejet | Réponse correcte |
|---|---|
| `invalid-semantic-directives` | Rétablis les valeurs exactes de langage, stdlib et NumericProfile |
| `invalid-section-order` | Déplace `parameters` avant `init`, puis `loop`, puis `bailout` |
| `undeclared-read` | Assigne d’abord une variable locale ou déclare un paramètre ; ne devine pas une valeur hôte |
| `possibly-uninitialized-read` | Initialise la variable locale sur chaque branche avant de la lire |
| `unmapped-function-slot` | Déclare un paramètre de fonction avec la liaison `classic fnN` correspondante |
| `bailout-not-boolean` | Utilise une comparaison explicite telle que `|z| < 4` |
| `source-too-large` | Réduis l’entrée de source et la sortie du formateur à 65 536 octets UTF-8 au plus |
| `generated-shader-too-large` | Simplifie la Definition ; ne demande pas une limite publique plus grande |

Écart v0.4.19 connu : une magnitude imbriquée entre parenthèses peut actuellement
être analysée, mais n’est pas canonique, échoue à l’aller-retour du formateur et
DOIT être bloquée par la validation de publication. Cet écart est suivi dans la
[référence normative §8](../specs/frm-like-language-v1.md#8-canonicalization-revisions-and-conformance),
avec l’activation du writer bloquée jusqu’à ce que le front-end la rejette.

Un outil conforme rejette la ponctuation non prise en charge, les macros, les
fonctions définies par l’utilisateur, les formules multiples, les directives
arbitraires et le contenu exécutable final. Les constructions non prises en
charge sont rejetées plutôt qu’exécutées avec un sens modifié.

## 7. Révisions, Remix et portabilité

Deux hachages répondent à des questions différentes :

- `sourceRevision` identifie les octets UTF-8 exacts de l’actif source de la
  Definition épinglée.
- `semanticHash` identifie le sens typé canonique. Les commentaires, le formatage
  insignifiant et le nom de formule ne le modifient pas ; les modifications exécutables le font.

Le lecteur publié hache les octets source exactement tels qu’ils sont fournis. La
normalisation CRLF/CR-vers-LF ne s’applique qu’à l’analyse et jamais à `sourceRevision` ;
les fins de ligne, les commentaires, le formatage ou un LF terminal peuvent donc
modifier `sourceRevision` sans modifier `semanticHash`. Le writer soumis à un
gate est plus strict : il doit émettre la forme déterministe du formateur et
passer l’enveloppe de sécurité avant persistance ou publication.

Un Profile a sa propre révision. Modifier la caméra ou la palette ne réécrit pas
le sens de la formule. De même, une compilation backend a sa propre révision et
ne peut pas devenir une seconde source de vérité.

Une Definition Standard est immuable à sa révision épinglée. **Open** exécute
cette Definition et ce Profile. **Remix** crée un contexte anonyme modifiable avec
une filiation figée ; il ne modifie ni n’usurpe le Record Standard. Les paramètres
de transfert sont consommés une fois et supprimés de l’URL. La sauvegarde et la
restauration cloud restent des opérations distinctes d’identité et d’autorisation.

Le travail portable suit le contrat de ressource donnant la priorité au lecteur. Un travail
autonome épingle ou incorpore la Definition, les valeurs de paramètre résolues, le
Profile, le langage, la stdlib et le NumericProfile nécessaires à la reproduction.
Le contrat exige que les futurs profils non pris en charge s’ouvrent en lecture
seule plutôt que d’être silencieusement rétrogradés. v1 n’expose actuellement que
`standard32`, et le gate de régression C10 reste en attente ; ce comportement de
profil futur n’est donc pas présenté comme un comportement produit exercé aujourd’hui.
L’activation du writer et la migration de production sont des gates de publication
distincts, non impliquées par ce manuel.

## 8. Classic `.frm` et l’Éditeur autonome

Classic `.frm` est un dialecte d’importation doté d’une grammaire source différente
et d’un axe de compatibilité `frmSemanticsVersion` distinct. Il peut contenir des
entrées multiples, des en-têtes Classic, des blocs séparés par deux-points, des
emplacements implicites et une sémantique historique que v1 canonique ne copie
volontairement pas comme syntaxe d’auteur.

L’Éditeur FRM autonome analyse actuellement cette surface compatible Classic et la
compile. Ses exemples partagés ne comprennent ni les trois directives v1 canoniques
ni la section v1 `parameters`. Ne traite pas une compilation réussie dans l’Éditeur
Classic comme preuve que la source est dans la forme du formateur v1 canonique.

Inversement, ne colle pas la forme du formateur v1 canonique dans l’Éditeur autonome
actuel en concluant que le langage n’est pas pris en charge lorsque la surface
d’auteur héritée la rejette. Utilise l’action Source du Formula Record pour examiner
ou télécharger la source v1 publiée, et ses actions Open/Remix pour exécuter
le runtime publié épinglé. La prise en charge du writer/importateur v1
canonique doit passer son propre gate d’activation avant que les règles de
disponibilité de cette section ou de la référence normative §9 ne changent.

Pour la sélection Classic, la compatibilité visuelle figée, les diagnostics
strict-v2 et le comportement Upgrade & Compare, utilise les
[FRM Compatibility and Migration Contracts v1](../specs/frm-compatibility-v1.md).
Pour la sémantique et les limites exactes du langage, la référence
[FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md), en anglais,
fait autorité.
