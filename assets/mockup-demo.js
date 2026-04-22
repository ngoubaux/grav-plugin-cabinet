/* Cabinet — Mode démo : données fictives
 * Chargé APRÈS store/index.js (priority 12) et AVANT main.js (priority 5).
 * Injecte de fausses données dans le store pour montrer l'interface sans backend.
 */

(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const TODAY = new Date().toISOString().slice(0, 10);

  function pastDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  function futureDate(daysFromNow) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
  }

  // ── Clients fictifs ──────────────────────────────────────────────────────────

  const DEMO_CLIENTS = {
    'demo-c001': {
      first_name: 'Marie', last_name: 'Dupont',
      email: 'marie.dupont@exemple.fr', phone: '06 12 34 56 78',
      ddn: '1985-03-15', postal_code: '06800',
      motif: 'Stress chronique et tensions cervicales',
      antecedents: 'Anxiété chronique depuis 3 ans. Légère spondylarthrose C4-C5. Traitements homéopathiques ponctuels.',
      notes: 'Très sensible aux pressions. Préfère séances en douceur. Réagit bien au travail sur méridien Rein.',
      created: pastDate(225) + 'T08:00:00Z',
      grav_uuid: '',
    },
    'demo-c002': {
      first_name: 'Jean', last_name: 'Martin',
      email: 'j.martin@exemple.fr', phone: '06 23 45 67 89',
      ddn: '1972-07-22', postal_code: '06000',
      motif: 'Lombalgies chroniques',
      antecedents: 'Hernie discale L4-L5 opérée en 2019. Travail sédentaire (informatique). Tabagisme.',
      notes: 'Travail doux en région lombaire. Éviter les pressions directes sur L4-L5.',
      created: pastDate(198) + 'T08:00:00Z',
      grav_uuid: '',
    },
    'demo-c003': {
      first_name: 'Sophie', last_name: 'Laurent',
      email: 'sophie.l@exemple.fr', phone: '07 34 56 78 90',
      ddn: '1991-11-08', postal_code: '06200',
      motif: 'Insomnie et fatigue profonde',
      antecedents: 'Burn-out professionnel fin 2024. Suivi psychologique en cours. Traitements anxiolytiques légers.',
      notes: 'Séances en soirée préférables. Avancer progressivement sur le plan énergétique.',
      created: pastDate(153) + 'T08:00:00Z',
      grav_uuid: '',
    },
    'demo-c004': {
      first_name: 'Pierre', last_name: 'Bernard',
      email: 'p.bernard@exemple.fr', phone: '06 45 67 89 01',
      ddn: '1968-04-30', postal_code: '06140',
      motif: 'Anxiété et troubles du sommeil',
      antecedents: 'HTA légère sous traitement (Amlodipine 5mg). Antécédent dépressif en 2018.',
      notes: 'Patient assidu, très motivé par la démarche. Surveiller tension artérielle.',
      created: pastDate(141) + 'T08:00:00Z',
      grav_uuid: '',
    },
    'demo-c005': {
      first_name: 'Alice', last_name: 'Moreau',
      email: 'alice.m@exemple.fr', phone: '07 56 78 90 12',
      ddn: '1979-09-17', postal_code: '06800',
      motif: 'Cervicalgies et céphalées tensionnelles',
      antecedents: 'Travail sur écran 8h/j depuis 10 ans. Acouphènes légers. Myopie forte.',
      notes: 'Commencer en position assise les premières minutes. Très bonne réactivité.',
      created: pastDate(97) + 'T08:00:00Z',
      grav_uuid: '',
    },
    'demo-c006': {
      first_name: 'Thomas', last_name: 'Petit',
      email: 't.petit@exemple.fr', phone: '06 67 89 01 23',
      ddn: '1995-02-28', postal_code: '06300',
      motif: 'Fatigue et perte de vitalité',
      antecedents: 'Sportif régulier (trail). Première expérience en Shiatsu. Aucun antécédent notable.',
      notes: 'Curieux et ouvert aux approches énergétiques. Prévoir explication MTC en fin de séance.',
      created: pastDate(52) + 'T08:00:00Z',
      grav_uuid: '',
    },
    'demo-c007': {
      first_name: 'Isabelle', last_name: 'Roux',
      email: 'i.roux@exemple.fr', phone: '06 78 90 12 34',
      ddn: '1963-06-12', postal_code: '06600',
      motif: 'Douleurs articulaires et raideur matinale',
      antecedents: 'Arthrose genou gauche. Hypothyroïdie traitée. Ménopause.',
      notes: 'Séances bi-mensuelles recommandées. Attention aux genoux en décubitus.',
      created: pastDate(310) + 'T08:00:00Z',
      grav_uuid: '',
    },
    'demo-c008': {
      first_name: 'Luc', last_name: 'Fontaine',
      email: 'l.fontaine@exemple.fr', phone: '07 89 01 23 45',
      ddn: '1988-09-03', postal_code: '06100',
      motif: 'Récupération sportive et prévention',
      antecedents: 'Compétiteur amateur (triathlon). Tendinite épaule droite en 2023.',
      notes: 'Suivi régulier pré/post compétition. Axer sur méridiens IG/TR pour l\'épaule.',
      created: pastDate(280) + 'T08:00:00Z',
      grav_uuid: '',
    },
  };

  // ── Séances fictives ──────────────────────────────────────────────────────────

  function sess(id, cid, daysAgo, h, type, obs, exercices, prochaine, bilan) {
    const date = pastDate(daysAgo);
    return {
      id, flex_id: id + '-flex', google_event_id: '', google_event_link: '',
      date, heure: h, duree: '75',
      datetime: date + 'T' + h + ':00',
      status: 'completed',
      appointment_type: type || 'shiatsu_futon',
      motif: type === 'shiatsu_chair' ? 'Shiatsu assis' : type === 'sophrologie' ? 'Sophrologie' : 'Shiatsu futon',
      observations: obs || '',
      exercices: exercices || '',
      prochaine: prochaine || '',
      bilan: bilan || null,
      sms_rappel_disabled: false,
    };
  }

  const DEMO_SESSIONS = {
    'demo-c001': [
      sess('s001','demo-c001', 188, '14:00', 'shiatsu_futon',
        'Première séance. Bilan général. Hara révèle une fragilité des méridiens Rein et Vessie. Contractures importantes en trapèzes et cervicales hautes. Travail d\'introduction sur la voie postérieure.',
        '', 'Débuter protocole Rein-Vessie à la prochaine séance.',
        null),
      sess('s002','demo-c001', 161, '14:00', 'shiatsu_futon',
        'Tension notable en zone cervicale haute (GB 20-21). Séance axée sur le méridien Rein / Vessie avec appuis lents sur voie postérieure. Bonne réceptivité.',
        'Automassage KI 1 (plante du pied) matin et soir, 3 min par pied.',
        'Continuer le travail sur l\'axe Rein-Vessie. Introduire méridien Poumon si le tonus s\'améliore.',
        { element_dominant: 'Eau', synthese_mtc: 'Vide de Yin Rein avec chaleur montante. Foie en léger excès.', prise_en_charge: 'BL 23, KI 3, KI 7, GV 4, CV 4', evolution: 'Nette détente en fin de séance. Mentionne une meilleure qualité de sommeil cette semaine.' }),
      sess('s003','demo-c001', 133, '14:00', 'shiatsu_futon',
        'Arrivée tendue, mâchoires serrées. Travail initié sur GB pour dénouer l\'axe cranio-cervical. Progressivement la respiration s\'est allongée et profonde.',
        'Étirements latéraux du cou 2 × 30s matin.',
        'Revenir sur méridien Foie et Triple Réchauffeur.',
        { element_dominant: 'Bois', synthese_mtc: 'Stase du Qi du Foie avec remontée de Yang.', prise_en_charge: 'GB 20, LR 3, LR 14, GB 21', evolution: 'Bonne ouverture en seconde partie. Repartie détendue.' }),
      sess('s004','demo-c001', 105, '14:00', 'shiatsu_futon',
        'Amélioration notable depuis septembre. Moins de céphalées selon elle. Travail de consolidation.',
        'Marche consciente 20 min/jour.',
        'Consolider les acquis. Introduire travail méridien Cœur.',
        null),
      sess('s005','demo-c001', 77, '14:00', 'shiatsu_futon',
        'Période hivernale stressante. Travail prioritaire sur le système nerveux parasympathique. Très bonne réponse au travail sur les méridiens Yin.',
        'Respiration 4-7-8 avant le coucher, 3 cycles.',
        null,
        null),
      sess('s006','demo-c001', 49, '14:00', 'shiatsu_futon',
        'Première séance de l\'année. Recommencement en douceur. Marie signale avoir bien suivi les exercices pendant les fêtes.',
        'Automassage KI 1, Respiration abdominale 10 min/j.',
        'Renforcer méridien Rate-Pancréas (rumination mentale).',
        { element_dominant: 'Eau', synthese_mtc: 'Vide de Qi Rein. Amélioration notable vs septembre.', prise_en_charge: 'KI 3, BL 23, GV 4, SP 6', evolution: 'Nette progression. Dort 7h en moyenne contre 5h en septembre.' }),
      sess('s007','demo-c001', 21, '14:00', 'shiatsu_futon',
        'Tension résiduelle en cervicales mais nette amélioration globale. Travail de méridien GB et TR pour finir de libérer l\'axe crânien.',
        'Continuer le Qi Gong matinal.',
        null,
        null),
    ],

    'demo-c002': [
      sess('s010','demo-c002', 77, '10:00', 'shiatsu_futon',
        'Première séance. Bilan global. Lombalgie gauche persistante. Hernie cicatrisée mais tension importante ilio-lombaire gauche.',
        '', 'Initier protocole Rein-Vessie adapté post-chirurgie.',
        null),
      sess('s011','demo-c002', 49, '10:00', 'shiatsu_futon',
        'Moins de raideur matinale selon lui. Travail sur psoas et diaphragme en complément de la voie postérieure.',
        'Exercice du chat/vache 10 répétitions matin, planche isométrique 3 × 20s.',
        'Bilan rotation lombaire. Travailler la chaîne postérieure complète.',
        null),
      sess('s012','demo-c002', 14, '10:00', 'shiatsu_futon',
        'Tension BL 23-54 toujours présente mais moins intense. Amplitude rotation droite améliorée en fin de séance. Jean dit travailler debout 2h/j désormais.',
        'Automassage sacré, Qi Gong lombaire.',
        'Introduire travail méridien Estomac pour ancrage.',
        { element_dominant: 'Eau', synthese_mtc: 'Vide de Yang Rein. Stase locale en lombaire basse. Amélioration progressive.', prise_en_charge: 'BL 23, BL 25, BL 40, KI 3, GV 4, ST 36', evolution: 'Amplitude rotation +30° depuis début du suivi. Douleurs réduites de moitié.' }),
    ],

    'demo-c003': [
      sess('s020','demo-c003', 105, '18:30', 'shiatsu_futon',
        'Bilan initial. Historique burn-out récent. Beaucoup de résistance corporelle, hara très tendu en Rate et Foie. Travail très doux, enveloppant.',
        '', null, null),
      sess('s021','demo-c003', 77, '18:30', 'shiatsu_futon',
        'Toujours des réveils nocturnes mais moins d\'anxiété au coucher. Légère ouverture en méridien Cœur. Séance apaisante.',
        'Journal de gratitude 5 min avant le coucher.',
        null, null),
      sess('s022','demo-c003', 49, '18:30', 'shiatsu_futon',
        'Amélioration du temps d\'endormissement (+). Séance axée sur méridien Cœur et Maître-Cœur. Très bonne réponse.',
        'Cohérence cardiaque soir 5 min (cohero.app).',
        'Renforcer méridien Rate-Pancréas (rumination mentale).',
        { element_dominant: 'Feu', synthese_mtc: 'Vide de Yin Cœur. Inquiétude excessive, nervosité intérieure.', prise_en_charge: 'HT 7, PC 6, SP 6, CV 17, BL 15', evolution: 'Dort 6h consécutives depuis 2 semaines, contre 3-4h avant le suivi.' }),
      sess('s023','demo-c003', 21, '18:30', 'shiatsu_futon',
        'Sophie rapporte une nette amélioration. Moins de pensées parasites la nuit. Hara plus détendu. Travail de consolidation.',
        'Maintenir cohérence cardiaque + Automassage HT 7.',
        null,
        { element_dominant: 'Feu', synthese_mtc: 'Nette amélioration. Yin Cœur en cours de reconstitution.', prise_en_charge: 'HT 7, PC 6, KI 3, CV 14', evolution: 'Qualité de sommeil passée de 3/10 à 7/10 selon elle.' }),
    ],

    'demo-c004': [
      sess('s030','demo-c004', 42, '17:00', 'shiatsu_futon',
        'Première séance. Patient réceptif, surpris par la profondeur de la détente obtenue. Hara révèle une fragilité du méridien Poumon.',
        '', null, null),
      sess('s031','demo-c004', 14, '17:00', 'shiatsu_futon',
        'Moins d\'hypervigilance selon Pierre. Travail méridien Poumon et intestin grêle. Bonne libération thoracique.',
        'Respiration nasale diaphragmatique 10 min/j.',
        'Vérifier le travail du GI (colon lié aux émotions non exprimées).',
        null),
    ],

    'demo-c005': [
      sess('s040','demo-c005', 152, '11:00', 'shiatsu_futon',
        'Bilan initial. Très contractée, méfiance initiale. Contractures trapèzes et scalènes massives. Introduction progressive.',
        '', null, null),
      sess('s041','demo-c005', 124, '11:00', 'shiatsu_futon',
        'Protocole initié côté GB. Travail sur atlas/axis, grande sensibilité zone C1-C2.',
        '', null, null),
      sess('s042','demo-c005', 96, '11:00', 'shiatsu_futon',
        'Toujours des céphalées mais moins intenses. Alice signale une amélioration depuis la 2e séance.',
        'Cercles d\'épaules 3 × 10 matin.', null, null),
      sess('s043','demo-c005', 68, '11:00', 'shiatsu_futon',
        'Amélioration mobilité rotation droite +20°. Nette détente trapèzes.',
        'Cercles d\'épaules, Rouleau cervical matin.', null, null),
      sess('s044','demo-c005', 40, '11:00', 'shiatsu_futon',
        'Nette progression. Céphalées réduites de moitié selon elle. Travail de décompression occipitale.',
        'Rouleau cervical matin 5 min.',
        'Intégrer travail épaules/trapèzes en profondeur.',
        { element_dominant: 'Bois', synthese_mtc: 'Montée de Yang du Foie avec tension GB persistante mais atténuée.', prise_en_charge: 'GB 20, GB 21, TW 5, LR 3, ST 36', evolution: 'Fréquence céphalées : 5/sem → 2/sem depuis le début du suivi.' }),
      sess('s045','demo-c005', 12, '11:00', 'shiatsu_futon',
        'Plus aucune céphalée depuis 3 semaines ! Travail de consolidation et intégration. Alice envisage un suivi d\'entretien mensuel.',
        'Automassage GB 20 au quotidien.',
        null,
        { element_dominant: 'Bois', synthese_mtc: 'Yang du Foie stabilisé. GB en bien meilleur état.', prise_en_charge: 'GB 20, LR 3, TW 5, BL 10', evolution: 'Objectif atteint. Zéro céphalée depuis 3 semaines.' }),
    ],

    'demo-c006': [
      sess('s050','demo-c006', 25, '14:30', 'shiatsu_futon',
        'Première séance très positive. Découverte du Shiatsu, nombreuses questions. Bilan énergétique : vide global mais tonus présent. Thomas bien ancré malgré la fatigue.',
        'Qi Gong du matin 5 min (vidéo envoyée).',
        'Mettre l\'accent sur méridien Rate-Estomac (assimilation et énergie).',
        { element_dominant: 'Terre', synthese_mtc: 'Vide de Qi Rate-Pancréas. Digestion lente, tendance aux ruminations post-effort.', prise_en_charge: 'ST 36, SP 3, CV 12, BL 20, BL 21', evolution: 'Reparti très détendu, dit se sentir "ancré". À revoir dans 3 semaines.' }),
    ],

    'demo-c007': [
      sess('s060','demo-c007', 290, '09:30', 'shiatsu_futon',
        'Bilan initial. Arthrose genou, raideur matinale. Travail d\'introduction sur méridiens Rate et Estomac.', '', null, null),
      sess('s061','demo-c007', 262, '09:30', 'shiatsu_futon',
        'Moins de raideur le matin selon Isabelle. Travail sur méridien Reins en soutien.', '', null, null),
      sess('s062','demo-c007', 234, '09:30', 'shiatsu_futon',
        'Suite du protocole arthrose. Isabelle apprécie beaucoup le travail énergétique.',
        'Automassage ST 36 quotidien.', null, null),
      sess('s063','demo-c007', 206, '09:30', 'shiatsu_futon',
        'Amélioration notable de la mobilité du genou. Travail de soutien thyroïde via méridien TR.', '', null, null),
      sess('s064','demo-c007', 178, '09:30', 'shiatsu_futon',
        'Séance de suivi bi-mensuel. Stabilisation des progrès.', '', null, null),
      sess('s065','demo-c007', 150, '09:30', 'shiatsu_futon',
        'Très bonne évolution globale. Isabelle a commencé la marche aquatique.', '', null, null),
      sess('s066','demo-c007', 122, '09:30', 'shiatsu_futon',
        'Hiver : travail de renforcement Yang Rein.', 'Automassage Rein, Respiration qi gong.', null, null),
      sess('s067','demo-c007', 94, '09:30', 'shiatsu_futon',
        'Printemps : travail de drainage, méridien Foie.', '', null, null),
      sess('s068','demo-c007', 66, '09:30', 'shiatsu_futon',
        'Suivi régulier. Isabelle est très satisfaite du parcours.', '', null, null),
      sess('s069','demo-c007', 38, '09:30', 'shiatsu_futon',
        'Séance d\'entretien. Très bon état général.',
        'Maintenir marche aquatique et automassage.', null,
        { element_dominant: 'Terre', synthese_mtc: 'Vide de Yang Rein et Rate stabilisé.', prise_en_charge: 'KI 3, ST 36, SP 9, BL 23', evolution: 'Mobilité articulaire nettement améliorée depuis 10 mois. Raideur matinale quasi disparue.' }),
    ],

    'demo-c008': [
      sess('s070','demo-c008', 245, '16:00', 'shiatsu_futon',
        'Bilan sportif. Focus sur récupération et méridien IG/TR pour épaule droite post-tendinite.', '', null, null),
      sess('s071','demo-c008', 217, '16:00', 'shiatsu_futon',
        'Séance pré-compétition triathlon. Travail d\'activation et d\'équilibre énergétique.', '', null, null),
      sess('s072','demo-c008', 196, '16:00', 'shiatsu_futon',
        'Post-compétition. Récupération et décharge des méridiens Poumon et Rate.', '', null, null),
      sess('s073','demo-c008', 168, '16:00', 'shiatsu_futon',
        'Suivi régulier. Épaule bien récupérée, aucune douleur résiduelle.', 'Étirements IG quotidiens.', null, null),
      sess('s074','demo-c008', 140, '16:00', 'shiatsu_futon',
        'Protocole entretien sportif. Foie et Rate en légère stase post-effort intense.', '', null, null),
      sess('s075','demo-c008', 112, '16:00', 'shiatsu_futon',
        'Séance hivernale. Renforcement Yang Rein pour l\'énergie de fond.', '', null, null),
      sess('s076','demo-c008', 84, '16:00', 'shiatsu_futon',
        'Pré-saison triathlon. Très bon état général.', 'Qi Gong avant entraînement.', null, null),
      sess('s077','demo-c008', 56, '16:00', 'shiatsu_futon',
        'Post-semi-marathon. Récupération complète en 1 séance.', '', null, null),
      sess('s078','demo-c008', 28, '16:00', 'shiatsu_futon',
        'Séance d\'entretien. Luc se prépare pour le triathlon national.',
        'Automassage SP 6, Respiration avant course.',
        'Séance post-compétition à prévoir.',
        { element_dominant: 'Métal', synthese_mtc: 'Bon équilibre Poumon-IG. Foie actif (Bois de printemps).', prise_en_charge: 'LU 9, LI 4, LR 3, GB 34, ST 36', evolution: 'Temps de récupération divisé par 2 depuis le début du suivi.' }),
    ],
  };

  // ── Rendez-vous à venir ────────────────────────────────────────────────────────

  function rdv(id, cid, daysFromNow, h, status, name) {
    const date = futureDate(daysFromNow);
    return {
      id, flex_id: id + '-flex',
      client_id: cid, client_name: name,
      date, heure: h, duree: '75',
      datetime: date + 'T' + h + ':00',
      status: status || 'confirmed',
      appointment_type: 'shiatsu_futon',
    };
  }

  const DEMO_RENDEZ_VOUS = [
    rdv('a001','demo-c002', 3,  '10:00', 'confirmed', 'Jean Martin'),
    rdv('a002','demo-c003', 7,  '18:30', 'planned',   'Sophie Laurent'),
    rdv('a003','demo-c001', 10, '14:00', 'confirmed', 'Marie Dupont'),
    rdv('a004','demo-c005', 18, '11:00', 'planned',   'Alice Moreau'),
    rdv('a005','demo-c004', 22, '17:00', 'confirmed', 'Pierre Bernard'),
    rdv('a006','demo-c007', 24, '09:30', 'planned',   'Isabelle Roux'),
    rdv('a007','demo-c006', 30, '14:30', 'confirmed', 'Thomas Petit'),
    rdv('a008','demo-c008', 35, '16:00', 'confirmed', 'Luc Fontaine'),
  ];

  // ── Communications fictives ───────────────────────────────────────────────────

  function com(id, cid, channel, msg, daysAgo, status, subject) {
    return {
      id, channel: channel || 'sms',
      to: DEMO_CLIENTS[cid]?.phone || DEMO_CLIENTS[cid]?.email || '',
      subject: subject || '',
      message: msg,
      createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      status: status || 'sent',
      transport: channel === 'email' ? 'mailto' : 'api',
      errorMessage: '',
      followUpAt: '',
    };
  }

  const DEMO_COMMUNICATIONS = {
    'demo-c001': [
      com('com001','demo-c001','sms',
        'Bonjour Marie, je vous rappelle votre séance de shiatsu demain mardi à 14h. N\'hésitez pas si vous avez des questions. À demain !',
        22, 'sent'),
      com('com002','demo-c001','sms',
        'Bonjour Marie, pour préparer votre prochaine séance, pensez à porter des vêtements amples et confortables. Lien de préparation : https://goubs.net/preparons-votre-visite. À bientôt !',
        49, 'sent'),
      com('com003','demo-c001','email',
        'Bonjour Marie,\n\nMerci pour votre confiance lors de notre séance du 3 mars.\n\nSi vous avez trouvé l\'accompagnement utile, vous pouvez laisser un avis sur ma fiche Google : https://g.page/r/goubs-shiatsu\n\nVotre retour est précieux.\n\nBien à vous,\nNicolas',
        50, 'sent', 'Suite de séance du 3 mars'),
    ],
    'demo-c002': [
      com('com010','demo-c002','sms',
        'Bonjour Jean, votre prochaine séance est fixée au 25 avril à 10h. Merci de me confirmer ou annuler sous 48h si nécessaire.',
        6, 'sent'),
    ],
    'demo-c003': [
      com('com020','demo-c003','sms',
        'Bonjour Sophie, comment se passe le suivi ? Les exercices de cohérence cardiaque vous ont-ils aidé ?',
        28, 'sent'),
      com('com021','demo-c003','sms',
        'Bonjour Sophie, votre prochain créneau est le 28 avril à 18h30. Je vous attends !',
        3, 'sent'),
    ],
    'demo-c005': [
      com('com030','demo-c005','sms',
        'Bonjour Alice, très bonne nouvelle lors de notre dernière séance. Continuez le rouleau cervical le matin !',
        13, 'sent'),
    ],
    'demo-c006': [
      com('com040','demo-c006','email',
        'Bonjour Thomas,\n\nMerci pour cette belle première séance ! J\'espère que vous avez pu ressentir les bienfaits dans les jours suivants.\n\nJe vous ai envoyé la vidéo de Qi Gong par message. À très bientôt,\nNicolas',
        24, 'sent', 'Suite de votre première séance'),
    ],
  };

  // ── Patch cabStore.load ────────────────────────────────────────────────────────

  cabStore.load = async function () {
    this.loadState = 'loading';
    this.loadError = '';

    // Simuler un délai réseau réaliste
    await new Promise(r => setTimeout(r, 600));

    this.clients        = DEMO_CLIENTS;
    this.sessions       = DEMO_SESSIONS;
    this.rendez_vous    = DEMO_RENDEZ_VOUS;
    this.communications = DEMO_COMMUNICATIONS;
    this.facturation    = {};

    this.smsEnabled = false;
    this.communicationSettings = {
      googleReviewUrl: 'https://g.page/r/demo-cabinet-shiatsu',
      templates: { prepVisite: '', relance: '', compteRendu: '' },
    };

    this.renderList();
    this.loadState = 'loaded';
  };

  // ── Patch des méthodes d'écriture ─────────────────────────────────────────────

  const _demoMsg = () => showToast('Mode démo — les modifications ne sont pas sauvegardées', 'info');

  cabStore.saveFiche       = async function () { _demoMsg(); };
  cabStore.createClient    = async function () { _demoMsg(); return false; };
  cabStore.deleteClient    = async function () { _demoMsg(); };
  cabStore.saveSession     = async function () { _demoMsg(); return false; };
  cabStore.updateSession   = async function () { _demoMsg(); return false; };
  cabStore.deleteSession   = async function () { _demoMsg(); };
  cabStore.sendCommunication = async function () { _demoMsg(); return false; };
  cabStore.sendPreparationSms = async function () { _demoMsg(); };
  cabStore.logCommunication = async function () { _demoMsg(); };
  cabStore.saveGoogleSettings = function () { _demoMsg(); };

})();
