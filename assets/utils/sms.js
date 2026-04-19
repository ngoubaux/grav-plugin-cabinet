/* Cabinet — SMS building utilities */

function parseSessionDateTime(session) {
  if(!session) return null;
  const iso=session.datetime||(session.date?`${session.date}T${session.heure||'00:00'}`:'');
  if(!iso) return null;
  const d=new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getPreferredSession(sessionList) {
  if(!sessionList?.length) return null;
  const list=[...sessionList].sort((a,b)=>{
    const at=parseSessionDateTime(a)?.getTime()||0;
    const bt=parseSessionDateTime(b)?.getTime()||0;
    return at-bt;
  });
  const now=Date.now();
  return list.find(s=>{const dt=parseSessionDateTime(s);return dt&&dt.getTime()>=now;}) || list[0] || null;
}

function formatDurationForSms(minutes) {
  const total=toMinuteCount(minutes), h=Math.floor(total/60), m=total%60;
  if(h&&m) return `${h}h${String(m).padStart(2,'0')}`;
  if(h) return `${h}h`;
  return `${m} min`;
}

function formatSessionSlotForSms(session) {
  const dt=parseSessionDateTime(session);
  if(!dt) return '';
  const dayLabel=dt.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});
  const timeLabel=String(session.heure||dt.toTimeString().slice(0,5)||'').slice(0,5);
  return `${capitalize(dayLabel)} à ${timeLabel}`;
}

function getPreparationVisitLink(client, clientId) {
  const rawId=client&&client.grav_uuid ? client.grav_uuid : clientId;
  const cleanId=compactUuid(rawId);
  return cleanId
    ? `https://www.goubs.net/preparons-votre-visite/id:${cleanId}`
    : 'https://www.goubs.net/preparons-votre-visite/';
}

function buildPreparationSms(client, sessionList, clientId) {
  const name=client ? `${String(client.first_name||'').trim()} ${String(client.last_name||'').trim()}`.trim() : '';
  const greeting=name ? `Bonjour ${name},` : 'Bonjour,';
  const session=client ? getPreferredSession(sessionList) : null;
  const sessionLabel=formatSessionSlotForSms(session);
  const durationLabel=session ? formatDurationForSms(session.duree) : '1h15';
  const link=getPreparationVisitLink(client, clientId);
  return `${greeting}

Afin de préparer notre première séance${sessionLabel ? ` de ${sessionLabel}` : ''}.
Je vous partage ce lien: ${link}

📍 60 chemin du Val Fleuri 🔐 Code portillon : 2507A 🏢 Bât B6 appt 08, 3ème étage, porte de gauche (à droite de la piscine)
⏱️ Durée : ${durationLabel} - Tarif : 75€ 👕 Tenue : vêtements souples, chaussettes propres

À bientôt, Nicolas
Le shiatsu est une approche d'accompagnement au bien-être qui ne se substitue pas à un traitement médical.`;
}
