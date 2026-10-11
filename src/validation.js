export const METHODS = ['Trolling', 'Vertical Jigging', 'Bottom Fishing', 'Mixed'];
export const SPECIES = ['Tuna', 'Mahi-mahi', 'Wahoo', 'Marlin', 'Sailfish', 'Snapper', 'Grouper', 'Jacks / Amberjack', 'King Mackerel', 'Spanish Mackerel', 'Other'];
// Authoritative 13 fishing locations supplied for Jamaica Fishing Logs.
export const BANKS = [
  'Mackerel (Bowditch)', 'California Bank', 'South Drop', 'Port Royal',
  'Henry Holmes Bank', 'Grappler Bank', 'Formigas Bank', 'Mobay Airport',
  'Trident Castle', 'Rio Grande', 'Falmouth Pier', 'Morant Cays', 'Maiden Cay'
];
export function normalizeTrip(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid report.');
  const fishing_date = String(raw.fishing_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fishing_date) || Number.isNaN(Date.parse(fishing_date+'T12:00:00Z'))) throw new Error('Choose a valid fishing date.');
  const today = new Date().toISOString().slice(0,10);
  if (fishing_date > today) throw new Error('Fishing date cannot be in the future.');
  const bank = String(raw.bank || '').trim();
  if (!BANKS.includes(bank)) throw new Error('Choose a fishing bank.');
  const method = String(raw.method || '');
  if (!METHODS.includes(method)) throw new Error('Choose a fishing method.');
  const mixed_methods = method === 'Mixed' ? [...new Set(Array.isArray(raw.mixed_methods) ? raw.mixed_methods : [])] : [];
  if (method === 'Mixed' && (mixed_methods.length < 2 || mixed_methods.some(x=> !METHODS.slice(0,3).includes(x)))) throw new Error('Select at least two methods for Mixed.');
  const target_species = String(raw.target_species || '');
  if (!SPECIES.includes(target_species)) throw new Error('Choose the target species.');
  const hours_fished = Number(raw.hours_fished);
  if (!Number.isFinite(hours_fished) || hours_fished <= 0 || hours_fished > 72) throw new Error('Enter fishing hours between 0 and 72.');
  const anglers_count = Number(raw.anglers_count);
  if (!Number.isInteger(anglers_count) || anglers_count < 1 || anglers_count > 100) throw new Error('Enter the number of anglers (1–100).');
  if (typeof raw.caught_any !== 'boolean') throw new Error('Indicate whether you caught anything.');
  const caught_any = raw.caught_any;
  const catches = caught_any ? raw.catches : [];
  if (!Array.isArray(catches) || catches.length > 30 || (caught_any && catches.length === 0)) throw new Error('Add at least one catch, or choose No catch.');
  const cleanCatches = catches.map(c=>{
    const species = String(c?.species || ''); const quantity = Number(c?.quantity);
    if (!SPECIES.includes(species) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Check catch species and quantity.');
    return {species, quantity};
  });
  const notes = String(raw.notes || '').trim();
  if (notes.length > 500) throw new Error('Notes must be 500 characters or fewer.');
  return {fishing_date, bank, method, mixed_methods, target_species, hours_fished, anglers_count, caught_any, catches:cleanCatches, notes};
}
export function canonicalFingerprint(trip) {
  // Fingerprint deliberately excludes catches and notes so minor changes don't create a second trip.
  return JSON.stringify([trip.fishing_date, trip.bank, trip.method, trip.target_species, trip.hours_fished, trip.anglers_count]);
}
