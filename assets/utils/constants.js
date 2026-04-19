/* Cabinet — domain constants */

const MERIDIANS = [
  {id:'P',   name:'Poumon'},
  {id:'GI',  name:'Gros Intestin'},
  {id:'E',   name:'Estomac'},
  {id:'Rte', name:'Rate'},
  {id:'C',   name:'Coeur'},
  {id:'IG',  name:'Intestin Grêle'},
  {id:'V',   name:'Vessie'},
  {id:'Rn',  name:'Rein'},
  {id:'MC',  name:'Maître Coeur'},
  {id:'TR',  name:'Triple Réchauffeur'},
  {id:'VB',  name:'Vésicule Biliaire'},
  {id:'F',   name:'Foie'},
];

const MERIDIAN_STATES = [
  {val:'',      label:'—'},
  {val:'plein', label:'Plein / Excès'},
  {val:'vide',  label:'Vide / Insuffisance'},
  {val:'stase', label:'Stase / Blocage'},
  {val:'ok',    label:'Harmonieux'},
];

const STATE_CLASS = {plein:'e-plein', vide:'e-vide', stase:'e-stase', ok:'e-ok', '':'e-nd'};

const STATUS_OPTS = [
  ['scheduled','Planifié'],
  ['confirmed','Confirmé'],
  ['completed','Terminé'],
  ['cancelled','Annulé'],
];

const TYPE_OPTS = [
  ['shiatsu_futon','Shiatsu futon'],
  ['shiatsu_chair','Shiatsu chair'],
  ['sophrologie','Sophrologie'],
];

const ELEMENT_OPTS = ['','Bois','Feu','Terre','Métal','Eau'];
