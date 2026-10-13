import { normalizeTrip, canonicalFingerprint, BANKS, METHODS, SPECIES } from './validation.js';
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const respond = (data, status=200) => new Response(JSON.stringify(data), {status, headers:JSON_HEADERS});
const hex = bytes => Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
async function sha(value) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
async function readBody(req) {
  if (Number(req.headers.get('content-length')||0) > 20000) throw new Error('Report too large.');
  const txt = await req.text(); if (txt.length > 20000) throw new Error('Report too large.');
  return JSON.parse(txt);
}
async function verifyTurnstile(token, req, env) {
  if (!env.TURNSTILE_SECRET) return false; // fail closed until configured
  if (!token || typeof token !== 'string') return false;
  const form = new FormData(); form.set('secret',env.TURNSTILE_SECRET); form.set('response',token);
  const ip = req.headers.get('CF-Connecting-IP'); if (ip) form.set('remoteip',ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
  return r.ok && Boolean((await r.json()).success);
}
async function insertCatches(db,id,catches) {
  if (!catches.length) return [];
  return catches.map(c=>db.prepare('INSERT INTO catches (trip_id,species,quantity) VALUES (?,?,?)').bind(id,c.species,c.quantity));
}
const validId = s => typeof s === 'string' && /^[a-f0-9-]{36}$/.test(s);
export default {
 async fetch(req,env) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
  if (!env.DB) return respond({error:'Database not configured.'},503);
  if (req.method==='GET' && url.pathname==='/api/admin/fisheries-report') {
    const expected = env.REPORT_ADMIN_TOKEN;
    const provided = req.headers.get('authorization') || '';
    if (!expected || typeof expected !== 'string' || expected.length < 24) return respond({error:'Admin reporting is not configured.'},503);
    if (!provided.startsWith('Bearer ') || provided.slice(7) !== expected) return respond({error:'Unauthorized.'},401);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z'));
    if (!dateOK(from) || !dateOK(to) || from > to || (Date.parse(to)-Date.parse(from)) > 366*86400000) return respond({error:'Choose a valid date range of up to 366 days.'},400);
    const bank = url.searchParams.get('bank') || '';
    if (bank && !BANKS.includes(bank)) return respond({error:'Invalid fishing bank.'},400);
    const filter = bank ? ' AND t.bank = ?' : '';
    const args = bank ? [from,to,bank] : [from,to];
    const summary = await env.DB.prepare(`SELECT COUNT(*) AS trips, COALESCE(SUM(t.caught_any),0) AS successful_trips, COALESCE(SUM(t.hours_fished),0) AS vessel_hours, COALESCE(SUM(t.hours_fished*t.anglers_count),0) AS angler_hours, COALESCE(SUM(t.anglers_count),0) AS angler_participations, COUNT(DISTINCT t.bank) AS banks_reporting FROM trips t WHERE t.fishing_date BETWEEN ? AND ?${filter}`).bind(...args).first();
    const byBank = (await env.DB.prepare(`SELECT t.bank, COUNT(*) AS trips, SUM(t.caught_any) AS successful_trips, SUM(t.hours_fished*t.anglers_count) AS angler_hours, COALESCE((SELECT SUM(c.quantity) FROM catches c JOIN trips tc ON tc.id=c.trip_id WHERE tc.bank=t.bank AND tc.fishing_date BETWEEN ? AND ?),0) AS catch_count FROM trips t WHERE t.fishing_date BETWEEN ? AND ?${filter} GROUP BY t.bank ORDER BY trips DESC, t.bank`).bind(from,to,...args).all()).results;
    const species = (await env.DB.prepare(`SELECT c.species, SUM(c.quantity) AS quantity, COUNT(DISTINCT t.id) AS trips_with_species FROM catches c JOIN trips t ON t.id=c.trip_id WHERE t.fishing_date BETWEEN ? AND ?${filter} GROUP BY c.species ORDER BY quantity DESC, c.species`).bind(...args).all()).results;
    const methods = (await env.DB.prepare(`SELECT t.method, COUNT(*) AS trips FROM trips t WHERE t.fishing_date BETWEEN ? AND ?${filter} GROUP BY t.method ORDER BY trips DESC`).bind(...args).all()).results;
    const totalCatch = species.reduce((sum,s)=>sum+Number(s.quantity),0);
    return respond({period:{from,to,bank:bank||'All banks'},generated_at:new Date().toISOString(),summary:{...summary,total_catch:totalCatch,zero_catch_trips:Number(summary.trips)-Number(summary.successful_trips),cpue: Number(summary.angler_hours)>0?totalCatch/Number(summary.angler_hours):null},by_bank:byBank,species,methods,notes:['Voluntary self-reported observations; not independently verified.','Counts are fish reported, not weight or biomass.','CPUE is fish per angler-hour, calculated as total fish divided by the sum of fishing hours multiplied by anglers per trip.','The sample is not necessarily representative of Jamaica-wide landings or fishing activity.','Angler names, free-text notes, browser identifiers and trip-level records are excluded.']});
  }
  if (req.method==='GET' && url.pathname==='/api/config') return respond({banks:BANKS,methods:METHODS,species:SPECIES,turnstileSiteKey:env.TURNSTILE_SITE_KEY||null});
  if (req.method==='GET' && url.pathname.startsWith('/api/trips/')) {
    const id=url.pathname.split('/')[3], token=req.headers.get('x-edit-token');
    if (!validId(id)||!token) return respond({error:'Report access token required.'},403);
    const trip=await env.DB.prepare('SELECT * FROM trips WHERE id=? AND edit_token_hash=?').bind(id,await sha(token)).first();
    if (!trip) return respond({error:'Report not found or access denied.'},404);
    const catches=(await env.DB.prepare('SELECT species,quantity FROM catches WHERE trip_id=?').bind(id).all()).results;
    return respond({trip:{...trip,mixed_methods:JSON.parse(trip.mixed_methods),caught_any:Boolean(trip.caught_any),catches,edit_token_hash:undefined,browser_hash:undefined,trip_fingerprint:undefined}});
  }
  if (req.method==='POST' && (url.pathname==='/api/trips' || /^\/api\/trips\/[a-f0-9-]{36}$/.test(url.pathname))) {
    try {
      const body=await readBody(req);
      if (!await verifyTurnstile(body.turnstile_token,req,env)) return respond({error:'Please complete the security check and try again.'},403);
      const trip=normalizeTrip(body);
      const idFromPath=url.pathname==='/api/trips'?null:url.pathname.split('/')[3];
      if (idFromPath) {
        const token=req.headers.get('x-edit-token'); if (!token) return respond({error:'Edit token required.'},403);
        const existing=await env.DB.prepare('SELECT * FROM trips WHERE id=? AND edit_token_hash=?').bind(idFromPath,await sha(token)).first();
        if (!existing) return respond({error:'Report not found or access denied.'},404);
        const prevCatches=(await env.DB.prepare('SELECT species,quantity FROM catches WHERE trip_id=?').bind(idFromPath).all()).results;
        const now=new Date().toISOString();
        const queries=[
          env.DB.prepare('INSERT INTO trip_edits(trip_id,edited_at,previous_json) VALUES (?,?,?)').bind(idFromPath,now,JSON.stringify({trip:existing,catches:prevCatches})),
          env.DB.prepare('UPDATE trips SET fishing_date=?,bank=?,method=?,mixed_methods=?,target_species=?,hours_fished=?,anglers_count=?,caught_any=?,notes=?,updated_at=? WHERE id=?').bind(trip.fishing_date,trip.bank,trip.method,JSON.stringify(trip.mixed_methods),trip.target_species,trip.hours_fished,trip.anglers_count,Number(trip.caught_any),trip.notes,now,idFromPath),
          env.DB.prepare('DELETE FROM catches WHERE trip_id=?').bind(idFromPath),
          ...await insertCatches(env.DB,idFromPath,trip.catches)
        ];
        await env.DB.batch(queries);
        return respond({ok:true,id:idFromPath,updated:true});
      }
      const submission_id=String(body.submission_id||'');
      const browser_id=String(body.browser_id||'');
      if (!validId(submission_id)||!validId(browser_id)) return respond({error:'Refresh the form and try again.'},400);
      const browser_hash=await sha(browser_id);
      const fingerprint=await sha(browser_hash+'|'+canonicalFingerprint(trip));
      const existingSubmission=await env.DB.prepare('SELECT id FROM trips WHERE submission_id=?').bind(submission_id).first();
      if (existingSubmission) return respond({error:'This report was already received.',duplicate:true,id:existingSubmission.id},409);
      const since=new Date(Date.now()-600000).toISOString();
      const duplicate=await env.DB.prepare('SELECT id FROM trips WHERE trip_fingerprint=? AND created_at>=? LIMIT 1').bind(fingerprint,since).first();
      if (duplicate) return respond({error:'This fishing trip was already reported within the last 10 minutes. Please edit the original report.',duplicate:true,id:duplicate.id},409);
      // Long-window same-browser trip check protects seasonal statistics from repeated reports.
      const sameTrip=await env.DB.prepare('SELECT id FROM trips WHERE browser_hash=? AND fishing_date=? AND bank=? AND method=? AND target_species=? LIMIT 1').bind(browser_hash,trip.fishing_date,trip.bank,trip.method,trip.target_species).first();
      if (sameTrip) return respond({error:'A similar trip is already recorded for this date. Please edit it rather than submit a duplicate.',duplicate:true,id:sameTrip.id},409);
      const id=crypto.randomUUID(), edit_token=crypto.randomUUID()+crypto.randomUUID(), now=new Date().toISOString();
      const queries=[env.DB.prepare('INSERT INTO trips (id,submission_id,browser_hash,trip_fingerprint,angler_name,fishing_date,bank,method,mixed_methods,target_species,hours_fished,anglers_count,caught_any,notes,edit_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,submission_id,browser_hash,fingerprint,'Anonymous',trip.fishing_date,trip.bank,trip.method,JSON.stringify(trip.mixed_methods),trip.target_species,trip.hours_fished,trip.anglers_count,Number(trip.caught_any),trip.notes,await sha(edit_token),now,now),...await insertCatches(env.DB,id,trip.catches)];
      try { await env.DB.batch(queries); } catch(e) { if (String(e).includes('UNIQUE')) return respond({error:'This report has already been submitted.',duplicate:true},409); throw e; }
      return respond({ok:true,id,edit_token,angler_name:'Anonymous'},201);
    } catch(e) { if (e instanceof SyntaxError) return respond({error:'Invalid request format.'},400); if (e instanceof Error && /^(Invalid|Choose|Enter|Indicate|Add|Check|Notes|Fishing|Select|Report)/.test(e.message)) return respond({error:e.message},400); console.error('Trip request failed',e); return respond({error:'Unable to save report right now. Please try again.'},500); }
  }
  return respond({error:'Not found.'},404);
 }
};
