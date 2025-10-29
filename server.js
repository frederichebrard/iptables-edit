/**
 * Serveur principal de l'application IPTable Manager
 *
 * Cette application web permet de gérer les règles iptables d'un serveur distant
 * via une connexion SSH sécurisée. Elle fournit une interface web moderne pour
 * visualiser, ajouter et supprimer des règles iptables.
 *
 * @module server
 * @requires express
 * @requires express-session
 * @requires body-parser
 */

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const iptablesRoutes = require('./routes/iptables-routes');

// Initialisation de l'application Express
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

/**
 * Middleware pour parser le corps des requêtes JSON et URL-encoded
 * Permet de récupérer les données envoyées par le client dans req.body
 */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/**
 * Configuration des sessions utilisateur
 * Chaque utilisateur obtient une session unique identifiée par un cookie
 * La session permet de maintenir la connexion SSH active entre les requêtes
 *
 * IMPORTANT: En production, changez le secret par une valeur aléatoire sécurisée
 */
app.use(session({
  secret: 'iptable-manager-secret-key-change-in-production', // À changer en production
  resave: false,              // Ne pas sauvegarder la session si elle n'a pas été modifiée
  saveUninitialized: false,   // Ne pas créer de session tant qu'elle n'est pas utilisée
  cookie: {
    secure: false,            // Mettre à true si HTTPS est utilisé
    maxAge: 3600000          // Durée de vie du cookie: 1 heure (en millisecondes)
  }
}));

// ============================================================================
// ROUTES CONFIGURATION
// ============================================================================

/**
 * Servir les fichiers statiques (HTML, CSS, JS) depuis le dossier 'public'
 * Permet l'accès direct aux ressources frontend
 */
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Monter les routes API pour la gestion iptables
 * Toutes les routes commenceront par /api/iptables
 */
app.use('/api/iptables', iptablesRoutes);

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Démarrage du serveur HTTP
 * Écoute sur le port spécifié (par défaut 3000)
 */
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  console.log('Accédez à l\'interface web dans votre navigateur');
});
