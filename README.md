# IPTables Manager

> Application web Node.js pour gérer les règles iptables d'un serveur distant via une connexion SSH sécurisée

![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Vue d'ensemble

**IPTables Manager** est une application web complète qui permet aux administrateurs système de gérer facilement les règles iptables de leurs serveurs Linux distants via une interface graphique intuitive. L'application se connecte aux serveurs via SSH et exécute les commandes iptables de manière sécurisée.

### Fonctionnalités principales

- **Connexion SSH sécurisée** : Authentification par clé privée uniquement (pas de mot de passe)
- **Visualisation complète** : Affichage de toutes les tables (filter, nat, raw, mangle) organisées par chaînes
- **Gestion des règles** :
  - Ajout de règles personnalisées ou via formulaire simplifié (NAT)
  - Suppression de règles par numéro
  - Tri des règles par différentes colonnes
- **Persistance** : Sauvegarde et restauration de la configuration iptables
- **Interface responsive** : Design moderne avec onglets pour naviguer entre les tables
- **Support multi-table** : Gestion des tables filter, nat, raw et mangle

## Prérequis

- Node.js (version 14 ou supérieure)
- Un serveur distant avec iptables installé
- Accès SSH au serveur avec une clé privée
- Privilèges sudo sur le serveur distant pour exécuter les commandes iptables

## Installation

1. Clonez ou téléchargez ce dépôt
2. Installez les dépendances :

```bash
npm install
```

## Configuration du serveur distant

Sur votre serveur distant, assurez-vous que :

1. L'utilisateur SSH a les privilèges sudo pour iptables :

```bash
# Éditez le fichier sudoers
sudo visudo

# Ajoutez cette ligne (remplacez 'username' par votre utilisateur)
username ALL=(ALL) NOPASSWD: /usr/sbin/iptables, /usr/sbin/iptables-save, /usr/sbin/iptables-restore
```

2. Le répertoire pour la sauvegarde existe :

```bash
sudo mkdir -p /etc/iptables
sudo chmod 755 /etc/iptables
```

## Configuration de la clé SSH

1. Générez une paire de clés SSH si vous n'en avez pas :

```bash
ssh-keygen -t rsa -b 4096
```

2. Copiez la clé publique sur le serveur distant :

```bash
ssh-copy-id username@serveur
```

3. Testez la connexion :

```bash
ssh -i ~/.ssh/id_rsa username@serveur
```

## Utilisation

1. Démarrez le serveur :

```bash
npm start
```

Ou en mode développement avec rechargement automatique :

```bash
npm run dev
```

2. Ouvrez votre navigateur et accédez à :

```
http://localhost:3000
```

3. Remplissez le formulaire de connexion :
   - **Adresse du serveur** : IP ou nom d'hôte du serveur distant
   - **Port SSH** : Port SSH (22 par défaut)
   - **Nom d'utilisateur** : Votre nom d'utilisateur SSH
   - **Chemin de la clé privée** : Chemin absolu vers votre clé privée SSH
     - Windows : `C:\Users\username\.ssh\id_rsa`
     - Linux/Mac : `/home/username/.ssh/id_rsa`

4. Cliquez sur "Se connecter"

## Fonctionnalités de l'interface

### Visualisation des règles

Une fois connecté, toutes les règles iptables sont affichées dans un tableau organisé par chaînes (INPUT, OUTPUT, FORWARD). Chaque règle affiche :
- Numéro de règle
- Nombre de paquets et octets traités
- Target (ACCEPT, DROP, REJECT, etc.)
- Protocole
- Source et destination
- Informations supplémentaires (ports, etc.)

### Ajouter une règle

Utilisez le champ "Ajouter une nouvelle règle" pour créer une nouvelle règle. Exemples :

```
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT
-A INPUT -s 192.168.1.0/24 -j ACCEPT
-I INPUT -p tcp --dport 22 -j ACCEPT
```

### Supprimer une règle

Cliquez sur le bouton "Supprimer" à côté de la règle que vous souhaitez supprimer.

### Sauvegarder la configuration

Cliquez sur "Sauvegarder" pour enregistrer la configuration actuelle dans `/etc/iptables/rules.v4`

### Restaurer la configuration

Cliquez sur "Restaurer" pour restaurer la dernière configuration sauvegardée.

### Rafraîchir

Cliquez sur "Rafraîchir" pour recharger les règles depuis le serveur.

## Architecture et structure du projet

### Stack technique

- **Backend** : Node.js avec Express.js
- **Frontend** : HTML5, CSS3, JavaScript (Vanilla)
- **SSH** : Module `ssh2` pour la connexion sécurisée
- **Sessions** : `express-session` pour gérer l'état utilisateur

### Structure des fichiers

```
iptable/
├── server.js                 # Serveur Express principal - Point d'entrée de l'application
├── package.json              # Dépendances NPM et scripts
├── CLAUDE.md                 # Instructions pour Claude Code (AI assistant)
├── README.md                 # Documentation (ce fichier)
│
├── routes/
│   └── iptables-routes.js    # Routes API REST pour la gestion iptables
│                             # Définit tous les endpoints (connect, rules, save, etc.)
│
├── services/
│   └── ssh-service.js        # Service de gestion SSH et commandes iptables
│                             # Contient toute la logique de connexion et parsing
│
└── public/                   # Fichiers statiques servis au client
    ├── index.html            # Interface utilisateur HTML
    ├── styles.css            # Styles CSS de l'application
    └── app.js                # Logique frontend JavaScript
```

### Flux de données

```
[Navigateur] <--> [Frontend (public/app.js)]
                         ↓ (HTTP/JSON)
              [Backend (routes/iptables-routes.js)]
                         ↓
              [Service SSH (ssh-service.js)]
                         ↓ (SSH)
              [Serveur distant - iptables]
```

## Sécurité

### Recommandations importantes

1. **Utilisez HTTPS en production** : Modifiez `server.js` pour utiliser HTTPS
2. **Changez le secret de session** : Modifiez la clé secrète dans `server.js`
3. **Limitez l'accès** : Configurez un pare-feu pour limiter l'accès à l'application
4. **Protégez vos clés SSH** : Ne partagez jamais vos clés privées
5. **Utilisez des règles sudo restrictives** : Limitez les commandes autorisées

### Exemple de configuration HTTPS

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('path/to/private-key.pem'),
  cert: fs.readFileSync('path/to/certificate.pem')
};

https.createServer(options, app).listen(443);
```

## Dépannage

### Erreur de connexion SSH

- Vérifiez que le chemin de la clé privée est correct
- Assurez-vous que les permissions de la clé sont correctes (600)
- Vérifiez que l'utilisateur a accès SSH au serveur

### Erreur "Permission denied" lors de l'exécution des commandes

- Vérifiez la configuration sudo sur le serveur distant
- Assurez-vous que l'utilisateur peut exécuter iptables avec sudo sans mot de passe

### Les règles ne s'affichent pas

- Vérifiez que iptables est installé sur le serveur
- Assurez-vous que l'utilisateur a les droits pour lire les règles

## API REST

L'application expose une API REST complète pour interagir avec iptables via SSH.

### Endpoints disponibles

#### Gestion de la connexion

| Méthode | Endpoint | Description | Authentification requise |
|---------|----------|-------------|--------------------------|
| `POST` | `/api/iptables/connect` | Établit une connexion SSH | Non |
| `POST` | `/api/iptables/disconnect` | Ferme la connexion SSH active | Non |
| `GET` | `/api/iptables/status` | Vérifie le statut de connexion | Non |

**Exemple de requête de connexion** :
```json
POST /api/iptables/connect
{
  "host": "192.168.1.100",
  "port": 22,
  "username": "admin",
  "privateKeyPath": "/home/user/.ssh/id_rsa"
}
```

#### Consultation des règles

| Méthode | Endpoint | Description | Authentification requise |
|---------|----------|-------------|--------------------------|
| `GET` | `/api/iptables/all-rules` | Liste toutes les règles de toutes les tables | Oui |
| `GET` | `/api/iptables/rules?table=filter` | Liste les règles d'une table spécifique | Oui |
| `GET` | `/api/iptables/iptables-save` | Récupère le contenu de iptables-save | Oui |

#### Modification des règles

| Méthode | Endpoint | Description | Authentification requise |
|---------|----------|-------------|--------------------------|
| `POST` | `/api/iptables/rules` | Ajoute une nouvelle règle | Oui |
| `DELETE` | `/api/iptables/rules/:table/:chain/:num` | Supprime une règle spécifique | Oui |

**Exemple d'ajout de règle** :
```json
POST /api/iptables/rules
{
  "rule": "-A INPUT -p tcp --dport 80 -j ACCEPT",
  "table": "filter"
}
```

#### Sauvegarde/Restauration

| Méthode | Endpoint | Description | Authentification requise |
|---------|----------|-------------|--------------------------|
| `POST` | `/api/iptables/save` | Sauvegarde la configuration dans /etc/iptables/rules.v4 | Oui |
| `POST` | `/api/iptables/restore` | Restaure la configuration depuis /etc/iptables/rules.v4 | Oui |

## Développement

### Structure du code

Le code est organisé en modules clairs avec des responsabilités bien définies :

- **server.js** : Configuration Express, middleware et démarrage du serveur
- **routes/iptables-routes.js** : Définition des endpoints API REST avec validation
- **services/ssh-service.js** : Logique métier (connexion SSH, exécution de commandes, parsing)
- **public/app.js** : Interface utilisateur et communication avec l'API

### Conventions de code

- **JSDoc** : Tous les fichiers JavaScript sont documentés avec des commentaires JSDoc
- **Modularité** : Chaque fichier a une responsabilité unique (separation of concerns)
- **Gestion d'erreurs** : Toutes les opérations async sont protégées par try/catch
- **Sécurité** : Validation des entrées utilisateur avant traitement

### Scripts NPM disponibles

```bash
npm start          # Démarre le serveur en mode production
npm run dev        # Démarre avec nodemon pour le rechargement automatique
```

### Améliorations possibles

- [ ] Ajouter l'authentification utilisateur (login/password)
- [ ] Support de multiples serveurs simultanés
- [ ] Export des règles en différents formats (JSON, CSV)
- [ ] Historique des modifications avec rollback
- [ ] Interface en mode sombre (dark mode)
- [ ] Notifications en temps réel (WebSockets)
- [ ] Support d'IPv6
- [ ] Tests unitaires et d'intégration

## Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Forkez le projet
2. Créez une branche pour votre fonctionnalité (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Poussez vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## Support

Pour toute question ou problème :

- Consultez la section [Dépannage](#dépannage)
- Ouvrez une issue sur GitHub
- Vérifiez que votre configuration SSH et sudo est correcte

## Auteur

Développé avec Node.js et Express.js

## Licence

MIT

---

**Avertissement** : Cette application permet d'exécuter des commandes système critiques. Assurez-vous de comprendre les règles iptables avant de les modifier. Une mauvaise configuration peut bloquer l'accès au serveur.
