/**
 * Application Frontend - Gestionnaire IPTables
 *
 * Ce fichier gère toute la logique côté client de l'interface web.
 * Il communique avec l'API backend pour gérer les règles iptables via SSH.
 *
 * @file public/app.js
 */

// ============================================================================
// ÉTAT DE L'APPLICATION
// ============================================================================

/**
 * État global de l'application
 * Contient l'état de connexion, la table active, les règles chargées et le tri
 */
const app = {
    connected: false,           // Statut de connexion SSH
    currentTable: 'filter',     // Table iptables actuellement affichée
    allRules: {},              // Cache de toutes les règles chargées {table: rules}
    sortColumn: null,          // Colonne actuellement utilisée pour le tri
    sortDirection: 'asc'       // Direction du tri: 'asc' ou 'desc'
};

// ============================================================================
// RÉFÉRENCES DOM
// ============================================================================

/**
 * Références aux éléments du DOM
 * Tous les éléments sont référencés au chargement pour éviter les lookups répétés
 */
const elements = {
    connectionForm: document.getElementById('connection-form'),
    connectionSection: document.getElementById('connection-section'),
    rulesSection: document.getElementById('rules-section'),
    connectionStatus: document.getElementById('connection-status'),
    connectBtn: document.getElementById('connect-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    addRuleForm: document.getElementById('add-rule-form'),
    natSimpleForm: document.getElementById('nat-simple-form'),
    ruleTable: document.getElementById('rule-table'),
    rulesContainer: document.getElementById('rules-container'),
    refreshBtn: document.getElementById('refresh-btn'),
    saveBtn: document.getElementById('save-btn'),
    restoreBtn: document.getElementById('restore-btn'),
    messageContainer: document.getElementById('message-container'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    ruleTypeBtns: document.querySelectorAll('.rule-type-btn')
};

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Affiche un message de notification à l'utilisateur
 *
 * Le message apparaît en haut de la page et disparaît automatiquement après 5 secondes.
 *
 * @param {string} message - Texte du message à afficher
 * @param {string} type - Type de message: 'info', 'success', 'error' (défaut: 'info')
 */
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;

    elements.messageContainer.appendChild(messageDiv);

    // Supprime automatiquement le message après 5 secondes
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

/**
 * Effectue une requête API vers le backend
 *
 * Fonction générique pour toutes les requêtes API. Gère automatiquement
 * les headers JSON et les erreurs.
 *
 * @param {string} endpoint - Endpoint de l'API (ex: '/connect', '/rules')
 * @param {Object} options - Options fetch (method, body, headers, etc.)
 * @returns {Promise<Object>} Réponse JSON parsée
 * @throws {Error} Si la requête échoue ou si le serveur renvoie une erreur
 */
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`/api/iptables${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur réseau');
        }

        return data;
    } catch (error) {
        console.error('Erreur API:', error);
        throw error;
    }
}

// ============================================================================
// GESTION DE LA CONNEXION SSH
// ============================================================================

/**
 * Vérifie le statut de connexion SSH au chargement de la page
 *
 * Appelé au chargement pour vérifier si une session SSH est déjà active.
 * Utile si l'utilisateur rafraîchit la page.
 */
async function checkConnectionStatus() {
    try {
        const data = await apiRequest('/status');
        updateConnectionUI(data.connected);
    } catch (error) {
        console.error('Erreur lors de la vérification du statut:', error);
    }
}

/**
 * Met à jour l'interface utilisateur selon le statut de connexion
 *
 * Affiche/masque les sections appropriées et charge les règles si connecté.
 *
 * @param {boolean} connected - true si connecté, false sinon
 */
function updateConnectionUI(connected) {
    app.connected = connected;

    if (connected) {
        // Mode connecté: afficher l'interface de gestion des règles
        elements.connectionStatus.textContent = 'Connecté';
        elements.connectionStatus.className = 'status-badge connected';
        elements.connectBtn.style.display = 'none';
        elements.disconnectBtn.style.display = 'inline-block';
        elements.rulesSection.style.display = 'block';
        loadAllRules();  // Charge immédiatement les règles
    } else {
        // Mode déconnecté: afficher le formulaire de connexion
        elements.connectionStatus.textContent = 'Non connecté';
        elements.connectionStatus.className = 'status-badge disconnected';
        elements.connectBtn.style.display = 'inline-block';
        elements.disconnectBtn.style.display = 'none';
        elements.rulesSection.style.display = 'none';
    }
}

/**
 * Event listener: Soumission du formulaire de connexion
 * Établit une connexion SSH au serveur distant avec les paramètres fournis
 */
elements.connectionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Récupération des données du formulaire
    const formData = new FormData(e.target);
    const connectionData = {
        host: formData.get('host'),
        port: parseInt(formData.get('port')),
        username: formData.get('username'),
        privateKeyPath: formData.get('privateKeyPath')
    };

    // Désactivation du bouton pendant la connexion
    elements.connectBtn.disabled = true;
    elements.connectBtn.textContent = 'Connexion...';

    try {
        await apiRequest('/connect', {
            method: 'POST',
            body: JSON.stringify(connectionData)
        });

        showMessage('Connexion établie avec succès', 'success');
        updateConnectionUI(true);
    } catch (error) {
        showMessage(`Erreur de connexion: ${error.message}`, 'error');
        updateConnectionUI(false);
    } finally {
        // Réactivation du bouton
        elements.connectBtn.disabled = false;
        elements.connectBtn.textContent = 'Se connecter';
    }
});

/**
 * Event listener: Bouton de déconnexion
 * Ferme la connexion SSH active
 */
elements.disconnectBtn.addEventListener('click', async () => {
    try {
        await apiRequest('/disconnect', { method: 'POST' });
        showMessage('Déconnecté', 'info');
        updateConnectionUI(false);
    } catch (error) {
        showMessage(`Erreur de déconnexion: ${error.message}`, 'error');
    }
});

// ============================================================================
// CHARGEMENT ET AFFICHAGE DES RÈGLES
// ============================================================================

/**
 * Charge toutes les règles de toutes les tables iptables
 *
 * Récupère les règles des 4 tables (filter, nat, raw, mangle) en une seule requête.
 * Les stocke dans le cache et affiche la table courante.
 */
async function loadAllRules() {
    elements.rulesContainer.innerHTML = '<div class="loading">Chargement des règles...</div>';

    try {
        const data = await apiRequest('/all-rules');
        app.allRules = data.tables;  // Met en cache toutes les règles
        displayRules(app.allRules[app.currentTable] || []);
    } catch (error) {
        elements.rulesContainer.innerHTML = `<div class="error">Erreur: ${error.message}</div>`;
        showMessage(`Erreur lors du chargement des règles: ${error.message}`, 'error');
    }
}

/**
 * Charge les règles d'une table iptables spécifique
 *
 * @param {string} table - Nom de la table (filter, nat, raw, mangle)
 */
async function loadRules(table = app.currentTable) {
    elements.rulesContainer.innerHTML = '<div class="loading">Chargement des règles...</div>';

    try {
        const data = await apiRequest(`/rules?table=${table}`);
        app.allRules[table] = data.rules;  // Met en cache les règles de cette table
        displayRules(data.rules);
    } catch (error) {
        elements.rulesContainer.innerHTML = `<div class="error">Erreur: ${error.message}</div>`;
        showMessage(`Erreur lors du chargement des règles: ${error.message}`, 'error');
    }
}

/**
 * Trie un tableau de règles selon une colonne et une direction
 *
 * @param {Array} rules - Tableau de règles à trier
 * @param {string} column - Nom de la colonne de tri (num, target, destPort, etc.)
 * @param {string} direction - Direction du tri: 'asc' ou 'desc'
 * @returns {Array} Nouveau tableau trié
 */
function sortRules(rules, column, direction) {
    return [...rules].sort((a, b) => {
        let valA = a[column] || '';
        let valB = b[column] || '';

        // Conversion en nombre pour les colonnes numériques
        if (column === 'num' || column === 'destPort' || column === 'toDestPort') {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * Gestionnaire de clic sur les en-têtes de colonne pour le tri
 *
 * Permet de trier les règles en cliquant sur les en-têtes de colonne.
 * Un second clic inverse la direction du tri.
 *
 * @param {number} chainIndex - Index de la chaîne (non utilisé mais conservé pour compatibilité)
 * @param {string} column - Nom de la colonne cliquée
 */
function handleSort(chainIndex, column) {
    // Si c'est la même colonne, inverser la direction
    if (app.sortColumn === column) {
        app.sortDirection = app.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        app.sortColumn = column;
        app.sortDirection = 'asc';
    }

    // Rafraîchir l'affichage
    displayRules(app.allRules[app.currentTable] || []);
}

/**
 * Affiche les règles iptables dans un tableau HTML
 *
 * Génère le HTML pour afficher les règles organisées par chaînes (INPUT, OUTPUT, etc.).
 * Applique le tri si une colonne est sélectionnée.
 *
 * @param {Array} chains - Tableau de chaînes contenant les règles
 *   Format: [{chain: 'INPUT', rules: [...]}, ...]
 */
function displayRules(chains) {
    if (!chains || chains.length === 0) {
        elements.rulesContainer.innerHTML = '<div class="no-rules">Aucune règle trouvée</div>';
        return;
    }

    let html = '';

    chains.forEach((chainData, chainIndex) => {
        if (chainData.rules.length > 0) {
            // Trier les règles si une colonne est sélectionnée
            let displayedRules = chainData.rules;
            if (app.sortColumn) {
                displayedRules = sortRules(chainData.rules, app.sortColumn, app.sortDirection);
            }

            // Fonction pour afficher l'icône de tri appropriée
            const getSortIcon = (column) => {
                if (app.sortColumn !== column) return '⇅';
                return app.sortDirection === 'asc' ? '↑' : '↓';
            };

            html += `
                <div class="chain-section">
                    <div class="chain-title">Chain: ${chainData.chain}</div>
                    <table class="rules-table">
                        <thead>
                            <tr>
                                <th class="sortable" onclick="handleSort(${chainIndex}, 'num')">
                                    N° <span class="sort-icon">${getSortIcon('num')}</span>
                                </th>
                                <th class="sortable" onclick="handleSort(${chainIndex}, 'target')">
                                    Target <span class="sort-icon">${getSortIcon('target')}</span>
                                </th>
                                <th class="sortable" onclick="handleSort(${chainIndex}, 'prot')">
                                    Prot <span class="sort-icon">${getSortIcon('prot')}</span>
                                </th>
                                <th class="sortable" onclick="handleSort(${chainIndex}, 'destPort')">
                                    Port Externe <span class="sort-icon">${getSortIcon('destPort')}</span>
                                </th>
                                <th class="sortable" onclick="handleSort(${chainIndex}, 'toDestIP')">
                                    IP Destination <span class="sort-icon">${getSortIcon('toDestIP')}</span>
                                </th>
                                <th class="sortable" onclick="handleSort(${chainIndex}, 'toDestPort')">
                                    Port Interne <span class="sort-icon">${getSortIcon('toDestPort')}</span>
                                </th>
                                <th>Extra</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            displayedRules.forEach(rule => {
                html += `
                    <tr>
                        <td>${rule.num}</td>
                        <td>${rule.target}</td>
                        <td>${rule.prot}</td>
                        <td>${rule.destPort || '-'}</td>
                        <td>${rule.toDestIP || '-'}</td>
                        <td>${rule.toDestPort || '-'}</td>
                        <td>${rule.extra || '-'}</td>
                        <td class="actions">
                            <button class="btn btn-danger btn-small"
                                    onclick="deleteRule('${chainData.chain}', ${rule.num})">
                                Supprimer
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
    });

    elements.rulesContainer.innerHTML = html || '<div class="no-rules">Aucune règle trouvée</div>';
}

// Gestion des onglets de type de règle
elements.ruleTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');

        // Mettre à jour les onglets
        elements.ruleTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Afficher le bon formulaire
        if (type === 'nat-simple') {
            elements.natSimpleForm.style.display = 'block';
            elements.addRuleForm.style.display = 'none';
        } else {
            elements.natSimpleForm.style.display = 'none';
            elements.addRuleForm.style.display = 'block';
        }
    });
});

// Ajouter une règle NAT simplifiée
elements.natSimpleForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const sourceIP = formData.get('nat-source-ip').trim();
    const externalPort = formData.get('nat-external-port');
    const targetIP = formData.get('nat-target-ip').trim();
    const internalPort = formData.get('nat-internal-port');
    const protocol = formData.get('nat-protocol');

    // Validation
    if (!sourceIP || !externalPort || !targetIP || !internalPort) {
        showMessage('Veuillez remplir tous les champs', 'error');
        return;
    }

    // Générer la commande iptables
    const rule = `-A PREROUTING -d ${sourceIP} -p ${protocol} -m ${protocol} --dport ${externalPort} --tcp-flags FIN,SYN,RST,ACK SYN -j DNAT --to-destination ${targetIP}:${internalPort}`;

    try {
        await apiRequest('/rules', {
            method: 'POST',
            body: JSON.stringify({ rule, table: 'nat' })
        });

        showMessage('Règle NAT ajoutée avec succès', 'success');

        // Ne réinitialiser que les champs de port et IP cible
        document.getElementById('nat-external-port').value = '';
        document.getElementById('nat-target-ip').value = '';
        document.getElementById('nat-internal-port').value = '';

        // Recharger la table NAT
        await loadRules('nat');

        // Si on est sur la table NAT, rafraîchir l'affichage
        if (app.currentTable === 'nat') {
            displayRules(app.allRules['nat'] || []);
        }
    } catch (error) {
        showMessage(`Erreur lors de l'ajout de la règle: ${error.message}`, 'error');
    }
});

// Ajouter une règle avancée
elements.addRuleForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const rule = formData.get('new-rule').trim();
    const table = formData.get('rule-table');

    if (!rule) {
        showMessage('Veuillez entrer une règle', 'error');
        return;
    }

    try {
        await apiRequest('/rules', {
            method: 'POST',
            body: JSON.stringify({ rule, table })
        });

        showMessage('Règle ajoutée avec succès', 'success');
        e.target.reset();

        // Recharger la table appropriée
        await loadRules(table);

        // Si on est sur la même table, rafraîchir l'affichage
        if (table === app.currentTable) {
            displayRules(app.allRules[table] || []);
        }
    } catch (error) {
        showMessage(`Erreur lors de l'ajout de la règle: ${error.message}`, 'error');
    }
});

// ============================================================================
// GESTION DES RÈGLES (AJOUT/SUPPRESSION)
// ============================================================================

/**
 * Supprime une règle iptables
 *
 * Demande confirmation avant de supprimer la règle, puis recharge la table.
 *
 * @param {string} chain - Nom de la chaîne (INPUT, OUTPUT, etc.)
 * @param {number} ruleNumber - Numéro de la règle à supprimer
 */
async function deleteRule(chain, ruleNumber) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la règle ${ruleNumber} de la chaîne ${chain} ?`)) {
        return;
    }

    try {
        await apiRequest(`/rules/${app.currentTable}/${chain}/${ruleNumber}`, {
            method: 'DELETE'
        });

        showMessage('Règle supprimée avec succès', 'success');
        await loadRules(app.currentTable);  // Recharge les règles
    } catch (error) {
        showMessage(`Erreur lors de la suppression: ${error.message}`, 'error');
    }
}

// Gestion des onglets
elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const table = btn.getAttribute('data-table');

        // Mettre à jour l'onglet actif
        elements.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Mettre à jour la table courante
        app.currentTable = table;

        // Mettre à jour le sélecteur dans le formulaire
        elements.ruleTable.value = table;

        // Afficher les règles de cette table
        if (app.allRules[table]) {
            displayRules(app.allRules[table]);
        } else {
            loadRules(table);
        }
    });
});

// Rafraîchir les règles
elements.refreshBtn.addEventListener('click', async () => {
    elements.refreshBtn.disabled = true;
    elements.refreshBtn.textContent = 'Chargement...';

    try {
        await loadAllRules();
    } finally {
        elements.refreshBtn.disabled = false;
        elements.refreshBtn.textContent = 'Rafraîchir';
    }
});

// Sauvegarder la configuration
elements.saveBtn.addEventListener('click', async () => {
    if (!confirm('Voulez-vous sauvegarder la configuration actuelle ?')) {
        return;
    }

    elements.saveBtn.disabled = true;

    try {
        await apiRequest('/save', { method: 'POST' });
        showMessage('Configuration sauvegardée avec succès', 'success');
    } catch (error) {
        showMessage(`Erreur lors de la sauvegarde: ${error.message}`, 'error');
    } finally {
        elements.saveBtn.disabled = false;
    }
});

// Restaurer la configuration
elements.restoreBtn.addEventListener('click', async () => {
    if (!confirm('Voulez-vous restaurer la configuration sauvegardée ? Cela écrasera la configuration actuelle.')) {
        return;
    }

    elements.restoreBtn.disabled = true;

    try {
        await apiRequest('/restore', { method: 'POST' });
        showMessage('Configuration restaurée avec succès', 'success');
        await loadAllRules();
    } catch (error) {
        showMessage(`Erreur lors de la restauration: ${error.message}`, 'error');
    } finally {
        elements.restoreBtn.disabled = false;
    }
});

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    checkConnectionStatus();

    // Synchroniser le sélecteur avec l'onglet actif
    elements.ruleTable.value = app.currentTable;
});
