# Imposteurs – 3D multijoueur (4 terrains)

Jeu multijoueur 3D avec salons, rôles et visibilité locale.

## Démarrage
1. Installer Node.js (version 18 ou supérieure).
2. Extraire l'archive.
3. Ouvrir un terminal dans le dossier du projet.
4. Exécuter `npm install`.
5. Exécuter `npm start`.
6. Ouvrir `http://localhost:3000` dans le navigateur.

Pour jouer sur le même réseau local, les autres joueurs ouvrent `http://ADRESSE_IP_DU_PC_SERVEUR:3000`. Autoriser Node.js sur le pare-feu Windows si nécessaire.

## Téléphone (v1.13)
Le jeu s'adapte à l'écran. Sur un téléphone, mets-le en **mode paysage** : un joystick apparaît en bas à gauche, et les boutons d'action de ton rôle en bas à droite (💬 chat et ⛶ plein écran au-dessus du joystick). La réunion, le salon et les menus ont une mise en page compacte. Le fichier `public/mobile.js` gère le tactile en simulant le clavier ; `?touch=1` dans l'URL force les commandes tactiles pour les tests.

## Terrains
L'hôte choisit le terrain dans le salon (menu « Terrain de jeu »), et peut le changer entre deux parties depuis l'écran de fin. Tous les terrains ont au moins 17 pièces, de la place pour plus de 350 objets à réparer et un tableau électrique ; les joueurs démarrent et se réunissent dans la salle de réunion du terrain.
- **Le Manoir** (20 pièces) : toutes les pièces sont reliées par des portes. Réunion : CONFÉRENCE.
- **Le Laboratoire** (18 pièces) : plusieurs cloisons fermées, des couloirs à contourner. Réunion : SALLE DE CONTRÔLE. Tableau : GÉNÉRATEUR.
- **Le Vaisseau** (18 pièces) : peu de portes, des chemins étroits autour d'un couloir central. Réunion : CAFÉTÉRIA. Tableau : RÉACTEUR.
- **Le Château** (20 pièces) : pierre, cachots, crypte, douves. Réunion : GRANDE SALLE. Tableau : SALLE DES MÉCANISMES.
Les plans sont définis dans `maps.js` (grille de pièces, portes, canalisations, tableau électrique) : pour ajouter un terrain, ajouter une entrée dans `DEFS` (le serveur vérifie au démarrage que toutes les pièces sont accessibles).

## Déroulement d'une partie
- Le premier joueur qui crée le salon en devient l'hôte.
- Il choisit le nombre exact de joueurs (4 à 10) avant de créer le salon.
- Les autres joueurs rejoignent avec le code du salon.
- Chacun doit cliquer sur « Je suis prêt ».
- L'hôte ne peut lancer la partie que lorsque le salon est complet et que tous les joueurs sont prêts.
- Les déplacements et l'affichage du manoir sont bloqués dans le salon d'attente.

## Visibilité
Pendant la partie, un joueur vivant ne reçoit que les positions des joueurs proches situés dans la même pièce, ainsi que les corps visibles dans cette zone. La caméra suit le joueur de façon fluide, avec un recul et une hauteur augmentés pour élargir le champ de vision et aider à voir les pièces voisines lorsque la géométrie le permet. Le brouillard est moins dense. Le Traceur, les réunions et les joueurs éliminés conservent leurs exceptions de visibilité prévues par les règles du jeu.

Les déplacements directionnels sont relatifs à l’orientation de la caméra et suivent les directions de l’écran : ↑ avance, ↓ recule, ← va à gauche et → va à droite. Le personnage tourne progressivement son corps dans le sens effectif de son déplacement. Chaque joueur ne voit que son propre rôle et les commandes de ses propres capacités ; les touches secrètes des autres rôles ne sont pas affichées.

## Commandes
ZQSD / WASD ou flèches : déplacement · Maj : courir · Souris : orienter la caméra
Les touches des capacités sont affichées individuellement dans le jeu selon le rôle attribué.
O : réglages

## Dernières règles de sabotage
- La partie commence avec l'écran entièrement éclairé : aucun masque de vision n'est affiché tant que le courant fonctionne.
- Les imposteurs utilisent **S** pour couper le courant. La panne reste active jusqu'à ce qu'un joueur non-imposteur répare le tableau jaune dans la salle du tableau électrique (**G**).
- Le buzzer **B** est bloqué tant que le courant est coupé ou qu'une fermeture de portes est active.
- Tous les imposteurs peuvent utiliser **D** pour fermer les portes du manoir. Par défaut, l'équipe dispose de 2 utilisations par partie et la fermeture dure 5 secondes.
- Un imposteur reçoit le rôle spécial **Ferreur**. Il peut utiliser **V** pour fermer la salle où il se trouve, sans limite d'utilisations, avec 5 secondes de fermeture et 30 secondes de recharge par défaut.
- L'hôte peut modifier les durées et le nombre de fermetures globales dans les réglages avec **O**.


## Carte et panne électrique
- Le plan affiche le nom de toutes les pièces du terrain et la position du joueur.
- Lors d'une panne, les joueurs non-imposteurs voient une route verte vers le tableau électrique (Salle électrique).
- À proximité du tableau, appuyer sur `R` démarre une réparation de 3 secondes. Il faut rester près du tableau pendant toute la réparation.
- L'imposteur conserve sa visibilité normale pendant la panne.
- Les alertes « COURANT COUPÉ » et « COURANT RÉTABLI » s'affichent au centre de l'écran pendant 3 secondes.

## Carte, panne de courant et réparation
- **Carte du manoir** (en haut à droite, touche **M** ou clic pour l'agrandir) : affiche le nom de chaque pièce, les portes, ta position et ta zone de lumière.
- **Panne (touche S de l'imposteur)** : « ⚡ COURANT COUPÉ » s'affiche à l'écran de tous (et reste signalé dans le bandeau du haut). L'imposteur garde toute sa lumière.
- Pour les autres joueurs, la zone de lumière diminue mais reste large (rayon de vision − 0,5, réglable via « Rayon de vision », 5 par défaut).
- Une **route verte** se trace vers le tableau électrique : sur la carte et directement sur le sol du terrain (flèches animées). Une balise jaune marque le tableau.
- Arrivé près du tableau, appuie sur **R** : barre de progression, réparation après 3 secondes (reste près du tableau).
- Quand le courant revient, « 💡 COURANT REVENU » s'affiche puis disparaît après 3 secondes.

## Tâches
Les joueurs normaux doivent accomplir **toutes les tâches de réparation de la partie** pour gagner : **200 par défaut, réglable par l'hôte de 10 à 300** (touche **O**, « Nombre de tâches par partie », appliqué au prochain lancement). Elles sont tirées au hasard à chaque partie, réparties dans toutes les pièces selon leur taille. Approche-toi d'un objet cassé, le nom de la tâche s'affiche, puis appuie sur **G** : la réparation dure **3 secondes** (reste près de la tâche, sinon elle est annulée). Chaque tâche est un **objet cassé visible dans le terrain** (lampe, table, machine, tuyau qui fuit, armoire, vitre fissurée…), de travers, abîmé, avec des fissures orange, des débris au sol, de la fumée ou des étincelles. Pendant la réparation, l'objet se remet en état en direct (il se redresse, retrouve ses couleurs, les débris disparaissent) et reste intact ensuite. Pendant la réparation, une barre de progression apparaît au-dessus du joueur et l'objet lui-même se remet en état, visibles par tous ceux qui voient ce joueur. La barre « TÂCHES DES JOUEURS » est partagée par toute l'équipe.

## Rôles d'imposteur
Tous les imposteurs peuvent tuer (F), couper le courant (S) et fermer les portes (D). L'écran affiche le type : « Imposteur : Ferreur », « Imposteur : Métamorphe » ou « Imposteur ».
- **Ferreur** : touche **V**, ferme la salle où il se trouve.
- **Métamorphe** : touche **C**, prend l'apparence (couleur + pseudo) du joueur le plus proche pendant 10 s (réglable), puis recharge de 30 s. La transformation s'arrête au début d'une réunion. Les autres imposteurs voient « vrai nom → nom imité ».
- **Invisible** : touche **I**, devient invisible pour tous les joueurs normaux pendant 10 s (réglable, recharge 30 s) et **peut tuer** pendant ce temps. Les autres imposteurs le voient en transparence. Une réunion arrête l'invisibilité.
- Il n'y a **que 3 rôles d'imposteur** : Ferreur, Métamorphe, Invisible. Avec 1 imposteur : un des 3 au hasard ; avec 2 : deux au hasard ; avec 3 : les trois.

## Canalisations
8 bouches (cercles noirs) reliées par paires, visibles sur le terrain. Chaque paire relie deux pièces voisines : on ne saute que d'une pièce. Un imposteur proche d'une bouche appuie sur **X** pour ressortir à la bouche jumelle. Elles apparaissent aussi sur la carte, seulement pour les imposteurs. Impossible pendant une réunion (recharge 1,5 s).

## Ange gardien et Influenceur (rôles de joueurs normaux)
Ces deux rôles sont distribués au début de la partie parmi les joueurs normaux (activables avec **O**). Ils jouent comme les autres tant qu'ils sont vivants ; leur pouvoir s'active **une fois éliminés** (fantômes). Tous deux peuvent utiliser les canalisations (**X**). Un texte à l'écran indique la touche à presser.

**Ange gardien** : s'approche d'un joueur vivant (4 m max) et appuie sur **P** : ce joueur est protégé 30 s (réglable, recharge 45 s). Un imposteur qui l'attaque échoue et subit sa recharge de meurtre.

**Influenceur** : s'approche d'un joueur vivant et appuie sur **P** : une liste de 5 objets colorés (chacun d'une couleur de joueur) s'affiche. Il choisit avec **1-5** l'objet qui a la couleur de son meurtrier (s'il l'a été par un imposteur), puis appuie encore sur **P** pour valider : l'objet s'affiche 20 s chez le vivant. **Échap** annule. 1 envoi par défaut (réglable, 0 = désactivé).

**Autres rôles** : un message « Appuie sur [touche] pour… » s'affiche quand la capacité est prête (F, V, C, I, T).

## Look de la map (style Among Us)
Vue du dessus légèrement inclinée (réglable via `CAM_PITCH` dans `game.js`) : on voit la face des murs en acier, avec un dessus clair et un liseré lumineux. Sols en plaques boulonnées, ombres douces au pied des murs et sous les meubles, halos de lumière par pièce, équerres de couleur et nom de la pièce peints au sol, portes coulissantes avec seuils à bandes jaune/noir et voyants, bouches d'aération rectangulaires, coque métallique autour du bâtiment. Tout le style est dans `public/skeld.js` ; les murs, portes et collisions restent inchangés.

## Écran de réunion
Dès qu'un buzzer ou un signalement lance la réunion, l'écran passe en mode réunion : gros chat à gauche, fenêtre des joueurs à droite (bonhommes de couleur, minuteur, phase). Pendant le vote, **clique** sur un joueur pour voter (ou « Passer / vote blanc »). Une fois tous les votes faits (ou le temps écoulé), une page « Résultat du vote » affiche pendant 7 s qui a voté pour qui, avec le décompte par couleur, avant la décision du juge et l'annonce de l'élimination.

## Buzzer
Le buzzer (**B**) ne fonctionne que dans la salle de réunion du terrain (CONFÉRENCE dans le Manoir). Les réunions s'y tiennent : tous les joueurs vivants y sont rassemblés autour de la table au début de la réunion.

## Signaler un corps
Un joueur vivant proche d'un corps (3 m) appuie sur **E** : la réunion démarre immédiatement dans la salle de réunion du terrain, même en cas de panne de courant ou de portes fermées. Un corps disparaît 6 secondes après le meurtre (réglage « Disparition d'un corps »).

## Musique
Une musique de suspense est générée dans le navigateur (aucun fichier audio) : discrète pendant les réunions, plus tendue pendant une panne de courant, coupée au salon et à l'écran de fin. Le bouton « 🔊 Musique » du panneau en haut à gauche la coupe (le choix est mémorisé).

## Meurtre : jingle et cinématique
À chaque meurtre, tous les joueurs entendent un jingle (plus discret pour les témoins). La victime voit pendant 3 secondes son écran se remplir de bruit (neige de télévision), puis une cinématique : le tueur court vers elle et la frappe, avec le nom du tueur affiché en grand. Seule la victime reçoit l'identité du tueur. Le jingle suit le bouton « Musique » (coupé = silence).


## Pouvoir du Juge
Le Juge ne peut trancher qu'après avoir réparé un certain nombre de tâches : **5 par défaut, réglable par l'hôte (touche O, « Tâches à réparer pour débloquer le pouvoir du Juge », 0 = dès le début)**. Le Juge voit son compteur (x/y) à l'écran. Tant que son pouvoir est bloqué, la réunion se termine après le vote sans élimination.

**Juger pendant le vote** : le Juge qui clique sur une carte pendant la phase de vote choisit entre **Voter** et **Juger**. « Juger » (possible seulement si son pouvoir est débloqué) clôt la réunion tout de suite : si le joueur accusé est un imposteur il est éliminé, sinon c'est le Juge qui est éliminé. Son jugement remplace le vote.

**Votes anonymes** : réglage de l'hôte (touche O, case « Votes anonymes »). Désactivé (par défaut) : l'écran de résultat montre qui a voté pour qui. Activé : il ne montre que les totaux par joueur (et les votes blancs), jamais qui a voté pour qui.

## Après l'élimination
- **Joueur normal éliminé (fantôme)** : il peut encore réparer des tâches (touche **G**), qui comptent pour l'équipe. Le tableau électrique reste réservé aux vivants.
- **Imposteur éliminé** : il peut encore saboter : couper le courant (**S**) et fermer toutes les portes (**D**, avec le même nombre d'utilisations que l'équipe). Il ne peut plus tuer. Si tous les imposteurs sont éliminés, la partie se termine quand même.
