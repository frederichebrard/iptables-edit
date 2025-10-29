/**
 * Routes API pour la gestion des règles iptables
 *
 * Ce module définit toutes les routes API permettant d'interagir avec le serveur distant
 * pour gérer les règles iptables via SSH. Toutes les routes (sauf /connect, /disconnect et /status)
 * nécessitent une connexion SSH active.
 *
 * @module routes/iptables-routes
 * @requires express
 * @requires ../services/ssh-service
 */

const express = require('express');
const router = express.Router();
const sshService = require('../services/ssh-service');

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Middleware pour vérifier qu'une connexion SSH est active
 *
 * Ce middleware protège les routes qui nécessitent une connexion SSH.
 * Si l'utilisateur n'est pas connecté, renvoie une erreur 401.
 *
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction pour passer au middleware suivant
 */
const requireConnection = (req, res, next) => {
  if (!sshService.isConnected(req.session.id)) {
    return res.status(401).json({ error: 'Non connecté. Veuillez vous connecter d\'abord.' });
  }
  next();
};

// ============================================================================
// ROUTES DE CONNEXION
// ============================================================================

/**
 * POST /api/iptables/connect
 * Établit une connexion SSH au serveur distant
 *
 * @body {string} host - Adresse IP ou nom d'hôte du serveur distant
 * @body {number} port - Port SSH (par défaut 22)
 * @body {string} username - Nom d'utilisateur SSH
 * @body {string} privateKeyPath - Chemin vers la clé privée SSH
 *
 * @returns {Object} { success: boolean, message: string }
 */
router.post('/connect', async (req, res) => {
  try {
    const { host, port, username, privateKeyPath } = req.body;

    // Validation des paramètres obligatoires
    if (!host || !username || !privateKeyPath) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    // Établissement de la connexion SSH
    await sshService.connect(req.session.id, {
      host,
      port: port || 22,
      username,
      privateKeyPath
    });

    // Marquer la session comme connectée
    req.session.connected = true;
    res.json({ success: true, message: 'Connexion établie' });
  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/iptables/disconnect
 * Ferme la connexion SSH active
 *
 * @returns {Object} { success: boolean, message: string }
 */
router.post('/disconnect', (req, res) => {
  try {
    sshService.disconnect(req.session.id);
    req.session.connected = false;
    res.json({ success: true, message: 'Déconnecté' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/iptables/status
 * Vérifie le statut de la connexion SSH
 *
 * @returns {Object} { connected: boolean }
 */
router.get('/status', (req, res) => {
  const connected = sshService.isConnected(req.session.id);
  res.json({ connected });
});

// ============================================================================
// ROUTES DE CONSULTATION DES RÈGLES
// ============================================================================

/**
 * GET /api/iptables/all-rules
 * Liste toutes les règles de toutes les tables iptables (filter, nat, raw, mangle)
 *
 * Nécessite une connexion SSH active (middleware requireConnection)
 *
 * @returns {Object} { success: boolean, tables: Object }
 */
router.get('/all-rules', requireConnection, async (req, res) => {
  try {
    const allRules = await sshService.listAllRules(req.session.id);
    res.json({ success: true, tables: allRules });
  } catch (error) {
    console.error('Erreur lors de la récupération des règles:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/iptables/rules
 * Liste les règles d'une table spécifique
 *
 * Nécessite une connexion SSH active (middleware requireConnection)
 *
 * @query {string} table - Nom de la table (filter, nat, raw, mangle) - Par défaut: 'filter'
 * @returns {Object} { success: boolean, rules: Array, table: string }
 */
router.get('/rules', requireConnection, async (req, res) => {
  try {
    const table = req.query.table || 'filter';
    const rules = await sshService.listRules(req.session.id, table);
    res.json({ success: true, rules, table });
  } catch (error) {
    console.error('Erreur lors de la récupération des règles:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/iptables/iptables-save
 * Récupère le contenu complet de iptables-save (format brut)
 *
 * Nécessite une connexion SSH active (middleware requireConnection)
 *
 * @returns {Object} { success: boolean, tables: Object }
 */
router.get('/iptables-save', requireConnection, async (req, res) => {
  try {
    const tables = await sshService.getIptablesSave(req.session.id);
    res.json({ success: true, tables });
  } catch (error) {
    console.error('Erreur lors de la récupération de iptables-save:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ROUTES DE MODIFICATION DES RÈGLES
// ============================================================================

/**
 * POST /api/iptables/rules
 * Ajoute une nouvelle règle iptables
 *
 * Nécessite une connexion SSH active (middleware requireConnection)
 *
 * @body {string} rule - Règle iptables à ajouter (ex: "-A INPUT -p tcp --dport 80 -j ACCEPT")
 * @body {string} table - Table cible (filter, nat, raw, mangle) - Par défaut: 'filter'
 * @returns {Object} { success: boolean, message: string }
 */
router.post('/rules', requireConnection, async (req, res) => {
  try {
    const { rule, table } = req.body;

    // Validation de la règle
    if (!rule) {
      return res.status(400).json({ error: 'Règle manquante' });
    }

    const result = await sshService.addRule(req.session.id, rule, table || 'filter');
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de l\'ajout de la règle:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/iptables/rules/:table/:chain/:num
 * Supprime une règle iptables spécifique
 *
 * Nécessite une connexion SSH active (middleware requireConnection)
 *
 * @param {string} table - Nom de la table (filter, nat, raw, mangle)
 * @param {string} chain - Nom de la chaîne (INPUT, OUTPUT, FORWARD, PREROUTING, POSTROUTING, etc.)
 * @param {number} num - Numéro de la règle à supprimer
 * @returns {Object} { success: boolean, message: string }
 */
router.delete('/rules/:table/:chain/:num', requireConnection, async (req, res) => {
  try {
    const { table, chain, num } = req.params;
    const result = await sshService.deleteRule(req.session.id, chain, num, table);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la suppression de la règle:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ROUTES DE SAUVEGARDE/RESTAURATION
// ============================================================================

/**
 * POST /api/iptables/save
 * Sauvegarde la configuration iptables actuelle dans /etc/iptables/rules.v4
 *
 * Nécessite une connexion SSH active (middleware requireConnection)
 *
 * @returns {Object} { success: boolean, message: string }
 */
router.post('/save', requireConnection, async (req, res) => {
  try {
    const result = await sshService.saveRules(req.session.id);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/iptables/restore
 * Restaure la configuration iptables depuis /etc/iptables/rules.v4
 *
 * Nécessite une connexion SSH active (middleware requireConnection)
 *
 * ATTENTION: Cette opération écrase la configuration actuelle
 *
 * @returns {Object} { success: boolean, message: string }
 */
router.post('/restore', requireConnection, async (req, res) => {
  try {
    const result = await sshService.restoreRules(req.session.id);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la restauration:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
