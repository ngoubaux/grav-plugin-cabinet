# Checklist de release — grav-plugin-cabinet

## 1. Pré-requis dépôt GitHub

- [x] Le dépôt `github.com/ngoubaux/grav-plugin-cabinet` est **public**
- [x] Le dépôt contient les fichiers obligatoires GPM :
  - [x] `blueprints.yaml` (métadonnées + formulaire admin)
  - [x] `cabinet.php` (classe principale du plugin)
  - [x] `cabinet.yaml` (config par défaut — aucune clé réelle)
  - [x] `CHANGELOG.md`
  - [x] `LICENSE` (MIT)
  - [x] `README.md`
- [ ] La branche par défaut est `main` (cohérent avec `.gitrepo`)

---

## 2. Vérification secrets avant push

- [x] `cabinet.yaml` (plugin) → uniquement des placeholders (`CHANGE_ME_BEFORE_DEPLOY`)
- [x] `assets/resalib-sync.gs` → `CALENDAR_ID`, `WEBHOOK_URL`, `CABINET_API_KEY` = `'REMPLACER'`
- [x] `blueprints.yaml` → `xxxx.apps.googleusercontent.com` = valeur d'exemple
- [x] **`user/config/plugins/cabinet.yaml`** est dans le `.gitignore` du dépôt parent (contient les vraies clés — NE PAS pousser)

---

## 3. Cohérence de version

- [x] `blueprints.yaml` → `version: 2.0.0`
- [x] `CHANGELOG.md` → entrée `# 2.0.0` présente
- [ ] Tag Git = `v2.0.0` (ou `2.0.0` — choisir et tenir constant)

---

## 4. Push du subrepo

```bash
cd /chemin/vers/shiatsu
git subrepo push user/plugins/cabinet
```

> En cas d'erreur : vérifier que le remote `git@github.com:ngoubaux/grav-plugin-cabinet.git` existe
> et que la branche `main` est initialisée sur GitHub.

Si le dépôt est vide (premier push) :

```bash
git subrepo push user/plugins/cabinet --branch main
```

---

## 5. Créer la Release GitHub v2.0.0

1. Sur GitHub → dépôt `grav-plugin-cabinet` → **Releases → Draft a new release**
2. Tag : `v2.0.0` (créer le tag à la volée sur `main`)
3. Title : `v2.0.0 — Release initiale`
4. Description : copier le contenu de `CHANGELOG.md` (section 2.0.0)
5. **Publish release** ← GPM ne peut indexer qu'une Release publiée, pas un simple tag

---

## 6. Soumettre à GetGrav (GPM)

Ouvrir cette issue sur `github.com/getgrav/grav` :

**URL pré-remplie :**
```
https://github.com/getgrav/grav/issues/new?title=%5Badd-resource%5D%20grav-plugin-cabinet&body=**Type**%3A%20Plugin%0A**Name**%3A%20Cabinet%0A**Slug**%3A%20cabinet%0A**Repository**%3A%20https%3A%2F%2Fgithub.com%2Fngoubaux%2Fgrav-plugin-cabinet%0A**License**%3A%20MIT
```

Corps de l'issue à compléter :
```
**Type**: Plugin
**Name**: Cabinet
**Slug**: cabinet
**Repository**: https://github.com/ngoubaux/grav-plugin-cabinet
**License**: MIT
**Description**: Cabinet de suivi client pour praticiens — gestion clients, rendez-vous, SMS, Drive, Flex Objects
```

---

## 7. Post-publication

- [ ] Tester l'installation via GPM sur une instance Grav fraîche :
  ```bash
  bin/gpm install cabinet
  ```
- [ ] Vérifier que la page d'admin affiche bien la section **Praticien** avec les champs de config
- [ ] Remplir les champs Praticien dans l'admin (nom, téléphone, adresse…) et envoyer un email de bienvenue test
- [ ] Documenter sur le README la liste des pages Grav à créer (`/cabinet`, `/preparons-votre-visite`)
