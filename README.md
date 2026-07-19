# Ravito — plan de nutrition sportive

Calculateur d'intervalle de ravitaillement (glucides + électrolytes) pour
l'endurance. React + Vite, déployable sur GitHub Pages.

## Développement

```bash
npm install
npm run dev        # serveur local
npm run build      # build de production dans dist/
npm run preview    # prévisualise le build
npm run typecheck  # tsc --noEmit (optionnel)
```

## Déploiement GitHub Pages

1. Crée un repo et pousse le code sur la branche `main`.
2. Repo → **Settings → Pages → Source : "GitHub Actions"**.
3. Chaque push sur `main` déclenche `.github/workflows/deploy.yml`
   (build + publication). L'app sera servie sur
   `https://<utilisateur>.github.io/<repo>/`.

### Base path

`vite.config.ts` utilise `base: "./"` (chemins relatifs) : l'app fonctionne
sur le sous-chemin GitHub Pages **sans coder le nom du repo**. L'app est
mono-page, donc pas de routing à gérer.

Si tu ajoutes plus tard un routeur (react-router en `BrowserRouter`),
remplace par `base: "/<nom-du-repo>/"` et gère le fallback 404 de Pages
(ou passe en `HashRouter`).

## Stack

React 18 · Vite 5 · Tailwind CSS 4 (plugin Vite) · recharts · lucide-react

## Structure

```
src/
  main.tsx           entrée React
  RavitoPlanner.jsx  le composant (formulaire + calcul + plan)
  index.css          @import "tailwindcss"
vite.config.ts
.github/workflows/deploy.yml
```
