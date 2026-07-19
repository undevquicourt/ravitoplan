import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base: './' → chemins relatifs, fonctionne sur https://<user>.github.io/<repo>/
// sans coder le nom du repo. Si tu ajoutes un routeur (react-router en
// BrowserRouter), remplace par base: '/<nom-du-repo>/'.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
