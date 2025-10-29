# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**iptable-manager** - Application web Node.js pour gérer les règles iptables d'un serveur distant via une connexion SSH sécurisée.

## Architecture

### Stack technique
- **Backend**: Node.js avec Express
- **Frontend**: HTML/CSS/JavaScript vanilla
- **SSH**: Module ssh2 pour la connexion au serveur distant
- **Sessions**: express-session pour gérer les connexions utilisateur

### Structure des fichiers
```
iptable/
├── server.js                 # Serveur Express principal
├── package.json              # Configuration et dépendances
├── routes/
│   └── iptables-routes.js    # Endpoints API REST
├── services/
│   └── ssh-service.js        # Gestion des connexions SSH et commandes iptables
└── public/
    ├── index.html            # Interface utilisateur
    ├── styles.css            # Styles CSS
    └── app.js                # Logique client JavaScript
```

## Fonctionnalités principales

1. **Connexion SSH**: Authentification par clé privée uniquement
2. **Visualisation**: Affichage des règles iptables par chaînes
3. **Gestion des règles**: Ajout et suppression de règles
4. **Sauvegarde/Restauration**: Persistance de la configuration iptables

## Development Workflow

### Installation
```bash
npm install
```

### Démarrage
```bash
npm start          # Production
npm run dev        # Développement avec nodemon
```

### Configuration serveur distant
Le serveur distant doit :
- Avoir iptables installé
- Autoriser l'utilisateur SSH à exécuter sudo iptables sans mot de passe
- Avoir le répertoire /etc/iptables pour les sauvegardes
