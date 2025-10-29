/**
 * Service de gestion des connexions SSH et des commandes iptables
 *
 * Ce service centralise toute la logique de connexion SSH et d'exécution
 * des commandes iptables sur le serveur distant. Il maintient une Map
 * des connexions actives indexées par sessionId pour gérer plusieurs
 * utilisateurs simultanément.
 *
 * @module services/ssh-service
 * @requires ssh2
 * @requires fs
 */

const { Client } = require('ssh2');
const fs = require('fs');

/**
 * Classe SSHService
 * Gère les connexions SSH et l'exécution des commandes iptables
 */
class SSHService {
  /**
   * Constructeur
   * Initialise la Map pour stocker les connexions SSH actives
   */
  constructor() {
    // Map<sessionId, Client> - Stocke une connexion SSH par session utilisateur
    this.connections = new Map();
  }

  // ==========================================================================
  // MÉTHODES DE CONNEXION SSH
  // ==========================================================================

  /**
   * Établit une connexion SSH au serveur distant
   *
   * Crée une nouvelle connexion SSH en utilisant une clé privée pour l'authentification.
   * La connexion est stockée dans la Map des connexions avec le sessionId comme clé.
   *
   * @param {string} sessionId - ID de session utilisateur (utilisé pour identifier la connexion)
   * @param {Object} config - Configuration SSH
   * @param {string} config.host - Adresse IP ou nom d'hôte du serveur
   * @param {number} [config.port=22] - Port SSH (par défaut 22)
   * @param {string} config.username - Nom d'utilisateur SSH
   * @param {string} config.privateKeyPath - Chemin vers la clé privée SSH
   * @returns {Promise<boolean>} Résout avec true si la connexion réussit
   * @throws {Error} Si la lecture de la clé échoue ou si la connexion SSH échoue
   */
  async connect(sessionId, config) {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      // Événement déclenché lorsque la connexion SSH est établie avec succès
      conn.on('ready', () => {
        this.connections.set(sessionId, conn);
        console.log(`Connexion SSH établie pour la session ${sessionId}`);
        resolve(true);
      });

      // Événement déclenché en cas d'erreur de connexion
      conn.on('error', (err) => {
        console.error('Erreur de connexion SSH:', err.message);
        reject(new Error(`Échec de la connexion SSH: ${err.message}`));
      });

      try {
        // Lecture synchrone de la clé privée depuis le système de fichiers
        const privateKey = fs.readFileSync(config.privateKeyPath);

        // Établissement de la connexion SSH
        conn.connect({
          host: config.host,
          port: config.port || 22,
          username: config.username,
          privateKey: privateKey
        });
      } catch (error) {
        reject(new Error(`Erreur de lecture de la clé privée: ${error.message}`));
      }
    });
  }

  /**
   * Exécute une commande sur le serveur distant via SSH
   *
   * Exécute une commande shell sur le serveur distant et retourne sa sortie.
   * La commande est exécutée dans le contexte de l'utilisateur SSH connecté.
   *
   * @param {string} sessionId - ID de session
   * @param {string} command - Commande shell à exécuter
   * @returns {Promise<string>} Résout avec la sortie standard (stdout) de la commande
   * @throws {Error} Si aucune connexion active ou si la commande échoue
   */
  async executeCommand(sessionId, command) {
    const conn = this.connections.get(sessionId);

    if (!conn) {
      throw new Error('Aucune connexion SSH active. Veuillez vous connecter d\'abord.');
    }

    return new Promise((resolve, reject) => {
      // Exécution de la commande sur le serveur distant
      conn.exec(command, (err, stream) => {
        if (err) {
          reject(new Error(`Erreur d'exécution: ${err.message}`));
          return;
        }

        let stdout = '';  // Sortie standard
        let stderr = '';  // Sortie d'erreur

        // Collecte de la sortie standard
        stream.on('data', (data) => {
          stdout += data.toString();
        });

        // Collecte de la sortie d'erreur
        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        // Événement déclenché lorsque la commande se termine
        stream.on('close', (code) => {
          if (code !== 0) {
            // Code de sortie non nul = erreur
            reject(new Error(`Commande échouée (code ${code}): ${stderr}`));
          } else {
            resolve(stdout);
          }
        });
      });
    });
  }

  // ==========================================================================
  // MÉTHODES DE RÉCUPÉRATION DES RÈGLES
  // ==========================================================================

  /**
   * Liste toutes les règles iptables pour toutes les tables
   *
   * Itère sur les 4 tables principales d'iptables (filter, nat, raw, mangle)
   * et récupère toutes les règles pour chaque table.
   *
   * @param {string} sessionId - ID de session
   * @returns {Promise<Object>} Objet avec les règles groupées par table
   *   Exemple: { filter: [...], nat: [...], raw: [...], mangle: [...] }
   */
  async listAllRules(sessionId) {
    const tables = ['filter', 'nat', 'raw', 'mangle'];
    const allRules = {};

    for (const table of tables) {
      try {
        // Exécute: sudo iptables -t <table> -L -n -v --line-numbers
        // -L: liste les règles, -n: affichage numérique, -v: verbose, --line-numbers: numéros de ligne
        const output = await this.executeCommand(
          sessionId,
          `sudo iptables -t ${table} -L -n -v --line-numbers`
        );
        allRules[table] = this.parseIptablesOutput(output);
      } catch (error) {
        console.error(`Erreur lors de la récupération de la table ${table}:`, error.message);
        allRules[table] = [];
      }
    }

    return allRules;
  }

  /**
   * Liste les règles d'une table iptables spécifique
   *
   * @param {string} sessionId - ID de session
   * @param {string} [table='filter'] - Nom de la table (filter, nat, raw, mangle)
   * @returns {Promise<Array>} Tableau de chaînes avec leurs règles
   */
  async listRules(sessionId, table = 'filter') {
    const output = await this.executeCommand(
      sessionId,
      `sudo iptables -t ${table} -L -n -v --line-numbers`
    );
    return this.parseIptablesOutput(output);
  }

  /**
   * Récupère et parse le contenu de iptables-save
   *
   * iptables-save génère un dump complet de la configuration iptables
   * dans un format qui peut être restauré avec iptables-restore.
   *
   * @param {string} sessionId - ID de session
   * @returns {Promise<Object>} Configuration parsée par table
   */
  async getIptablesSave(sessionId) {
    const output = await this.executeCommand(sessionId, 'sudo iptables-save');
    return this.parseIptablesSave(output);
  }

  // ==========================================================================
  // MÉTHODES DE MODIFICATION DES RÈGLES
  // ==========================================================================

  /**
   * Ajoute une nouvelle règle iptables
   *
   * @param {string} sessionId - ID de session
   * @param {string} rule - Règle iptables complète (ex: "-A INPUT -p tcp --dport 80 -j ACCEPT")
   * @param {string} [table='filter'] - Table cible (filter, nat, raw, mangle)
   * @returns {Promise<Object>} { success: true, message: string }
   * @throws {Error} Si la commande iptables échoue
   */
  async addRule(sessionId, rule, table = 'filter') {
    // Ajoute l'option -t uniquement si la table n'est pas 'filter' (table par défaut)
    const tableOption = table !== 'filter' ? `-t ${table} ` : '';
    const command = `sudo iptables ${tableOption}${rule}`;
    await this.executeCommand(sessionId, command);
    return { success: true, message: 'Règle ajoutée avec succès' };
  }

  /**
   * Supprime une règle iptables par son numéro
   *
   * @param {string} sessionId - ID de session
   * @param {string} chain - Nom de la chaîne (INPUT, OUTPUT, FORWARD, etc.)
   * @param {number} ruleNumber - Numéro de la règle dans la chaîne (commence à 1)
   * @param {string} [table='filter'] - Table cible
   * @returns {Promise<Object>} { success: true, message: string }
   * @throws {Error} Si la commande iptables échoue
   */
  async deleteRule(sessionId, chain, ruleNumber, table = 'filter') {
    const tableOption = table !== 'filter' ? `-t ${table} ` : '';
    const command = `sudo iptables ${tableOption}-D ${chain} ${ruleNumber}`;
    await this.executeCommand(sessionId, command);
    return { success: true, message: 'Règle supprimée avec succès' };
  }

  // ==========================================================================
  // MÉTHODES DE SAUVEGARDE/RESTAURATION
  // ==========================================================================

  /**
   * Sauvegarde la configuration iptables actuelle
   *
   * Exécute iptables-save et redirige la sortie vers /etc/iptables/rules.v4
   * Ce fichier peut ensuite être utilisé pour restaurer la configuration.
   *
   * @param {string} sessionId - ID de session
   * @returns {Promise<Object>} { success: true, message: string }
   * @throws {Error} Si la sauvegarde échoue
   */
  async saveRules(sessionId) {
    await this.executeCommand(sessionId, 'sudo iptables-save > /etc/iptables/rules.v4');
    return { success: true, message: 'Configuration sauvegardée' };
  }

  /**
   * Restaure la configuration iptables depuis le fichier de sauvegarde
   *
   * Exécute iptables-restore en lisant depuis /etc/iptables/rules.v4
   * ATTENTION: Cela écrase complètement la configuration actuelle.
   *
   * @param {string} sessionId - ID de session
   * @returns {Promise<Object>} { success: true, message: string }
   * @throws {Error} Si la restauration échoue
   */
  async restoreRules(sessionId) {
    await this.executeCommand(sessionId, 'sudo iptables-restore < /etc/iptables/rules.v4');
    return { success: true, message: 'Configuration restaurée' };
  }

  // ==========================================================================
  // MÉTHODES DE PARSING
  // ==========================================================================

  /**
   * Parse la sortie de la commande 'iptables -L'
   *
   * Analyse le format texte de iptables -L et le convertit en structure de données.
   * La sortie est organisée par chaînes, chaque chaîne contenant un tableau de règles.
   *
   * Format d'entrée typique:
   * Chain INPUT (policy ACCEPT)
   * num   pkts bytes target     prot opt source               destination
   * 1     1234 5678  ACCEPT     tcp  --  0.0.0.0/0            0.0.0.0/0           tcp dpt:80
   *
   * @param {string} output - Sortie brute de 'iptables -L -n -v --line-numbers'
   * @returns {Array<Object>} Tableau de chaînes avec leurs règles
   *   Format: [{ chain: 'INPUT', rules: [{num, target, prot, ...}, ...] }, ...]
   */
  parseIptablesOutput(output) {
    const chains = [];
    const lines = output.split('\n');
    let currentChain = null;
    let rules = [];

    for (const line of lines) {
      // Détecte le début d'une nouvelle chaîne (ex: "Chain INPUT (policy ACCEPT)")
      if (line.startsWith('Chain')) {
        // Sauvegarder la chaîne précédente si elle existe
        if (currentChain) {
          chains.push({ chain: currentChain, rules });
        }
        const match = line.match(/Chain (\S+)/);
        currentChain = match ? match[1] : null;
        rules = [];
      }
      // Détecte une ligne de règle (commence par un numéro)
      else if (line.match(/^\s*\d+/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 8) {
          // Format: [num, pkts, bytes, target, prot, opt, source, destination, ...extra]
          const extraString = parts.slice(8).join(' ');
          const parsedExtra = this.parseExtraFields(extraString);

          rules.push({
            num: parts[0],           // Numéro de la règle
            target: parts[3],        // Cible (ACCEPT, DROP, REJECT, DNAT, etc.)
            prot: parts[4],          // Protocole (tcp, udp, icmp, all, etc.)
            opt: parts[5],           // Options
            source: parts[6],        // Adresse source
            destination: parts[7],   // Adresse destination
            extra: extraString,      // Informations supplémentaires (ports, etc.)
            // Champs parsés pour faciliter l'affichage
            sourcePort: parsedExtra.sourcePort,
            destPort: parsedExtra.destPort,
            toDestIP: parsedExtra.toDestIP,
            toDestPort: parsedExtra.toDestPort,
            toDestination: parsedExtra.toDestination
          });
        }
      }
    }

    // Ajouter la dernière chaîne
    if (currentChain) {
      chains.push({ chain: currentChain, rules });
    }

    return chains;
  }

  /**
   * Parse les champs supplémentaires dans la sortie de 'iptables -L'
   *
   * Extrait les informations détaillées comme les ports et adresses de destination
   * depuis la colonne 'extra' de la sortie iptables.
   *
   * Exemples d'entrée:
   * - "tcp dpt:19070 to:192.168.127.70:9001"
   * - "tcp spt:443 dpt:80"
   * - "udp dpts:5000:6000"
   *
   * @param {string} extraString - Chaîne contenant les informations supplémentaires
   * @returns {Object} Objet avec les champs parsés (ports, IPs de destination)
   */
  parseExtraFields(extraString) {
    const result = {
      sourcePort: null,        // Port source (spt)
      destPort: null,          // Port destination (dpt/dpts)
      toDestIP: null,          // IP de destination (pour DNAT/SNAT)
      toDestPort: null,        // Port de destination (pour DNAT/SNAT)
      toDestination: null      // Destination complète IP:port
    };

    if (!extraString) return result;

    // Parse source port (spt:xxx)
    const sptMatch = extraString.match(/spt:(\d+)/);
    if (sptMatch) {
      result.sourcePort = sptMatch[1];
    }

    // Parse destination port (dpt:xxx ou dpts:xxx pour range)
    const dptMatch = extraString.match(/dpts?:(\d+(?::\d+)?)/);
    if (dptMatch) {
      result.destPort = dptMatch[1];
    }

    // Parse to-destination (to:IP:port) pour les règles NAT
    const toMatch = extraString.match(/to:([\d.]+):?(\d+)?/);
    if (toMatch) {
      result.toDestIP = toMatch[1];
      result.toDestPort = toMatch[2] || null;
      result.toDestination = toMatch[2] ? `${toMatch[1]}:${toMatch[2]}` : toMatch[1];
    }

    return result;
  }

  /**
   * Parse la sortie de 'iptables-save'
   *
   * iptables-save génère un format texte qui peut être restauré avec iptables-restore.
   * Ce format est organisé par tables, puis par chaînes, puis par règles.
   *
   * Format d'entrée typique:
   * *filter
   * :INPUT ACCEPT [0:0]
   * :FORWARD DROP [0:0]
   * -A INPUT -p tcp -m tcp --dport 22 -j ACCEPT
   * COMMIT
   *
   * @param {string} output - Sortie brute de 'iptables-save'
   * @returns {Object} Configuration parsée organisée par tables
   *   Format: { filter: [{chain, policy, rules}, ...], nat: [...], ... }
   */
  parseIptablesSave(output) {
    const tables = {};
    const lines = output.split('\n');
    let currentTable = null;
    let currentChains = [];

    for (const line of lines) {
      // Détecte le début d'une nouvelle table (ex: "*filter", "*nat")
      if (line.startsWith('*')) {
        if (currentTable) {
          tables[currentTable] = currentChains;
        }
        currentTable = line.substring(1);  // Retire le '*'
        currentChains = [];
      }
      // Détecte les définitions de chaînes (ex: ":INPUT ACCEPT [0:0]")
      else if (line.startsWith(':')) {
        const match = line.match(/:(\S+)\s+(\S+)/);
        if (match) {
          currentChains.push({
            chain: match[1],    // Nom de la chaîne (INPUT, OUTPUT, etc.)
            policy: match[2],   // Politique par défaut (ACCEPT, DROP, etc.)
            rules: []
          });
        }
      }
      // Détecte les règles (ex: "-A INPUT -p tcp --dport 22 -j ACCEPT")
      else if (line.startsWith('-A ')) {
        const match = line.match(/-A\s+(\S+)\s+(.*)/);
        if (match && currentChains.length > 0) {
          const chainName = match[1];
          const ruleContent = match[2];

          // Trouve la chaîne correspondante
          const chainObj = currentChains.find(c => c.chain === chainName);
          if (chainObj) {
            chainObj.rules.push({
              raw: line,                              // Règle complète brute
              content: ruleContent,                   // Contenu sans "-A CHAIN"
              parsed: this.parseRuleContent(ruleContent)  // Version parsée
            });
          }
        }
      }
    }

    // Ajoute la dernière table
    if (currentTable) {
      tables[currentTable] = currentChains;
    }

    return tables;
  }

  /**
   * Parse le contenu d'une règle iptables pour extraire les informations clés
   *
   * Analyse une règle iptables et extrait ses composants principaux.
   *
   * Exemple d'entrée: "-p tcp -s 192.168.1.0/24 -d 10.0.0.1 --dport 80 -j ACCEPT"
   *
   * @param {string} content - Contenu de la règle à parser
   * @returns {Object} Objet avec les composants de la règle parsés
   */
  parseRuleContent(content) {
    const parsed = {
      protocol: null,       // Protocole (-p)
      source: null,         // Source (-s)
      destination: null,    // Destination (-d)
      sport: null,          // Port source (--sport)
      dport: null,          // Port destination (--dport)
      target: null,         // Action/cible (-j)
      toDestination: null,  // Destination NAT (--to-destination)
      other: []             // Autres options non parsées
    };

    const tokens = content.split(/\s+/);

    // Parcours des tokens pour extraire les options
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      switch (token) {
        case '-p':
          parsed.protocol = tokens[++i];
          break;
        case '-s':
          parsed.source = tokens[++i];
          break;
        case '-d':
          parsed.destination = tokens[++i];
          break;
        case '--sport':
          parsed.sport = tokens[++i];
          break;
        case '--dport':
          parsed.dport = tokens[++i];
          break;
        case '-j':
          parsed.target = tokens[++i];
          break;
        case '--to-destination':
          parsed.toDestination = tokens[++i];
          break;
        default:
          // Ajoute les autres options non reconnues
          if (token.startsWith('-')) {
            parsed.other.push(token + (tokens[i + 1] && !tokens[i + 1].startsWith('-') ? ' ' + tokens[++i] : ''));
          }
      }
    }

    return parsed;
  }

  // ==========================================================================
  // MÉTHODES UTILITAIRES
  // ==========================================================================

  /**
   * Ferme la connexion SSH pour une session
   *
   * Termine proprement la connexion SSH et la retire de la Map des connexions.
   *
   * @param {string} sessionId - ID de session
   */
  disconnect(sessionId) {
    const conn = this.connections.get(sessionId);
    if (conn) {
      conn.end();
      this.connections.delete(sessionId);
      console.log(`Connexion SSH fermée pour la session ${sessionId}`);
    }
  }

  /**
   * Vérifie si une session a une connexion SSH active
   *
   * @param {string} sessionId - ID de session
   * @returns {boolean} true si la connexion existe et est active
   */
  isConnected(sessionId) {
    return this.connections.has(sessionId);
  }
}

module.exports = new SSHService();
