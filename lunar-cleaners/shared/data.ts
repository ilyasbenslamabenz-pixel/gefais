// Données d'équilibrage du jeu : ressources, outils, véhicules, améliorations, missions.

export type ResourceId = 'dust' | 'mineral' | 'metal' | 'crystal' | 'xeno';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  price: number;
  color: string;
  icon: string;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  dust: { id: 'dust', name: 'Poussière lunaire', price: 1, color: '#d8c7a3', icon: '🌫️' },
  mineral: { id: 'mineral', name: 'Minéraux', price: 12, color: '#9aa7b8', icon: '🪨' },
  metal: { id: 'metal', name: 'Débris métalliques', price: 9, color: '#c9ced6', icon: '🔩' },
  crystal: { id: 'crystal', name: 'Cristaux rares', price: 45, color: '#6ff3ff', icon: '💎' },
  xeno: { id: 'xeno', name: 'Xénolite', price: 120, color: '#c46bff', icon: '🧬' },
};
export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

export type ToolKind = 'handheld' | 'drone' | 'ride';

export interface ToolDef {
  id: number; // 1..7
  name: string;
  kind: ToolKind;
  radius: number; // rayon de nettoyage (m)
  power: number; // unités de poussière (0..255) retirées / seconde au centre
  reach: number; // distance devant le joueur
  capacity: number; // capacité de collecte
  speed: number; // multiplicateur de vitesse de déplacement
  price: number;
  level: number; // niveau joueur requis
  desc: string;
  color: string;
}

export const TOOLS: ToolDef[] = [
  { id: 1, name: 'Brosse manuelle', kind: 'handheld', radius: 0.7, power: 130, reach: 1.5, capacity: 40, speed: 1, price: 0, level: 1, desc: 'Une simple brosse à dents réglementaire. Il faut bien commencer quelque part.', color: '#ff6b6b' },
  { id: 2, name: 'Balai lunaire', kind: 'handheld', radius: 1.05, power: 165, reach: 1.9, capacity: 70, speed: 1, price: 150, level: 2, desc: 'Large balai en fibres de carbone. Couvre deux fois plus de surface.', color: '#ffb347' },
  { id: 3, name: 'Aspirateur portatif', kind: 'handheld', radius: 1.4, power: 210, reach: 2.6, capacity: 130, speed: 1, price: 600, level: 3, desc: 'Aspire la poussière à distance. Réservoir intégré.', color: '#4ecdc4' },
  { id: 4, name: 'Aspirateur industriel', kind: 'handheld', radius: 1.9, power: 270, reach: 3.0, capacity: 260, speed: 0.95, price: 2500, level: 5, desc: 'Turbine haute pression et cuve dorsale de grande capacité.', color: '#45b7ff' },
  { id: 5, name: 'Machine motorisée', kind: 'handheld', radius: 2.5, power: 340, reach: 1.5, capacity: 450, speed: 0.95, price: 7000, level: 7, desc: 'Monobrosse motorisée à double rotor. Nettoyage professionnel.', color: '#a66bff' },
  { id: 6, name: 'Robot autonome', kind: 'drone', radius: 2.5, power: 340, reach: 1.5, capacity: 750, speed: 1, price: 16000, level: 9, desc: 'Machine motorisée + drone nettoyeur autonome qui travaille en orbite autour de vous.', color: '#ff6bd6' },
  { id: 7, name: 'Véhicule industriel de nettoyage', kind: 'ride', radius: 3.6, power: 420, reach: 2.2, capacity: 1300, speed: 1.75, price: 40000, level: 12, desc: 'Plateforme flottante de récurage à chenilles magnétiques. Vous la pilotez debout.', color: '#ffd93d' },
];

export interface VehicleDef {
  id: string;
  name: string;
  speed: number; // vitesse max m/s
  accel: number;
  turn: number; // rad/s
  radius: number; // rayon de nettoyage
  power: number;
  capacityBonus: number;
  price: number;
  level: number;
  desc: string;
  color: string;
  size: number; // rayon de collision
  autopilot?: boolean;
}

export const VEHICLES: VehicleDef[] = [
  { id: 'robot', name: 'Petit robot aspirateur', speed: 9, accel: 14, turn: 3.2, radius: 1.5, power: 260, capacityBonus: 120, price: 1200, level: 4, desc: 'Disque aspirateur sur coussin magnétique. Agile et économique.', color: '#4ecdc4', size: 1.1 },
  { id: 'tractor', name: 'Mini-tracteur lunaire', speed: 11, accel: 10, turn: 2.4, radius: 2.3, power: 320, capacityBonus: 300, price: 5000, level: 6, desc: 'Tracteur à roues géantes équipé d\'une brosse frontale.', color: '#ff8c42', size: 1.6 },
  { id: 'industrial', name: 'Véhicule industriel', speed: 12, accel: 8, turn: 1.9, radius: 3.4, power: 400, capacityBonus: 700, price: 14000, level: 8, desc: 'Balayeuse lourde à trois rotors. Avale tout sur son passage.', color: '#ffd93d', size: 2.2 },
  { id: 'truck', name: 'Camion de collecte', speed: 15, accel: 7, turn: 1.6, radius: 2.6, power: 360, capacityBonus: 2500, price: 25000, level: 10, desc: 'Énorme benne de collecte. Idéal pour les longs trajets.', color: '#6bcB77', size: 2.6 },
  { id: 'giant', name: 'Robot autonome géant', speed: 8, accel: 5, turn: 1.3, radius: 5.2, power: 520, capacityBonus: 1800, price: 90000, level: 14, desc: 'Mécha nettoyeur colossal. Touche R : pilote automatique.', color: '#ff6bd6', size: 3.2, autopilot: true },
];

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  basePrice: number;
  growth: number;
  icon: string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'backpack', name: 'Soute renforcée', desc: '+25 % de capacité de collecte par niveau', maxLevel: 6, basePrice: 200, growth: 2.2, icon: '🎒' },
  { id: 'refinery', name: 'Raffinerie de la base', desc: '+10 % sur le prix de vente par niveau', maxLevel: 6, basePrice: 400, growth: 2.3, icon: '🏭' },
  { id: 'thrusters', name: 'Propulseurs dorsaux', desc: '+8 % de vitesse et de saut par niveau', maxLevel: 5, basePrice: 300, growth: 2.2, icon: '🚀' },
  { id: 'motor', name: 'Moteur de nettoyage', desc: '+15 % de puissance de nettoyage par niveau', maxLevel: 6, basePrice: 350, growth: 2.3, icon: '⚙️' },
  { id: 'scanner', name: 'Scanner géologique', desc: '+30 % de chances de trouver des ressources rares', maxLevel: 4, basePrice: 800, growth: 2.6, icon: '📡' },
];

export function upgradePrice(u: UpgradeDef, currentLevel: number) {
  return Math.round(u.basePrice * Math.pow(u.growth, currentLevel));
}

export function xpToNext(level: number) {
  return Math.round(80 * Math.pow(level, 1.5));
}

export type DebrisType = 'rock' | 'junk' | 'crystal' | 'pod';

export interface DebrisDef {
  type: DebrisType;
  name: string;
  hp: number;
  minTier: number;
  radius: number;
  loot: Partial<Record<ResourceId, [number, number]>>;
}

export const DEBRIS: Record<DebrisType, DebrisDef> = {
  rock: { type: 'rock', name: 'Rocher', hp: 40, minTier: 1, radius: 0.9, loot: { mineral: [2, 4], dust: [4, 8] } },
  junk: { type: 'junk', name: 'Déchet spatial', hp: 60, minTier: 1, radius: 0.9, loot: { metal: [2, 5] } },
  crystal: { type: 'crystal', name: 'Amas de cristaux', hp: 90, minTier: 2, radius: 0.8, loot: { crystal: [1, 3], mineral: [1, 2] } },
  pod: { type: 'pod', name: 'Capsule extraterrestre', hp: 160, minTier: 3, radius: 1.0, loot: { xeno: [1, 2], crystal: [0, 2] } },
};

// ---------- Missions scénarisées ----------
export interface Stats {
  dustCollected: number;
  sells: number;
  debrisDestroyed: number;
  zonesVisited: string[];
  crystals: number;
  totalEarned: number;
  zoneDust: Record<string, number>;
  zonesCompleted: number;
}

export interface MissionDef {
  id: string;
  title: string;
  desc: string;
  target: number;
  reward: number;
  xp: number;
  progress: (s: Stats, owned: { tools: number[]; vehicles: string[] }) => number;
}

export const MISSIONS: MissionDef[] = [
  { id: 'm1', title: 'Premier coup de brosse', desc: 'Récoltez 20 unités de poussière lunaire.', target: 20, reward: 25, xp: 20, progress: (s) => s.dustCollected },
  { id: 'm2', title: 'Premier chargement', desc: 'Vendez votre récolte au Collecteur de la station (touche E).', target: 1, reward: 50, xp: 30, progress: (s) => s.sells },
  { id: 'm3', title: 'Montée en gamme', desc: 'Achetez le Balai lunaire dans la boutique (touche B).', target: 1, reward: 75, xp: 40, progress: (_s, o) => (o.tools.includes(2) ? 1 : 0) },
  { id: 'm4', title: 'Casseur de cailloux', desc: 'Détruisez 3 débris (rochers, déchets...).', target: 3, reward: 120, xp: 60, progress: (s) => s.debrisDestroyed },
  { id: 'm5', title: 'Agent de quartier', desc: 'Récoltez 400 unités dans la Zone de départ.', target: 400, reward: 220, xp: 120, progress: (s) => s.zoneDust['start'] || 0 },
  { id: 'm6', title: 'Aspiration !', desc: 'Achetez l\'Aspirateur portatif.', target: 1, reward: 300, xp: 150, progress: (_s, o) => (o.tools.includes(3) ? 1 : 0) },
  { id: 'm7', title: 'Permis de conduire lunaire', desc: 'Achetez votre premier véhicule.', target: 1, reward: 600, xp: 250, progress: (_s, o) => (o.vehicles.length > 0 ? 1 : 0) },
  { id: 'm8', title: 'Explorateur', desc: 'Visitez les 6 zones de la carte.', target: 6, reward: 900, xp: 300, progress: (s) => s.zonesVisited.length },
  { id: 'm9', title: 'Travail d\'équipe', desc: 'Participez à la certification de 2 zones (60 % de propreté).', target: 2, reward: 2000, xp: 600, progress: (s) => s.zonesCompleted },
  { id: 'm10', title: 'Cristallier', desc: 'Récoltez 15 cristaux rares.', target: 15, reward: 2500, xp: 800, progress: (s) => s.crystals },
  { id: 'm11', title: 'Magnat lunaire', desc: 'Gagnez 100 000 crédits au total.', target: 100000, reward: 10000, xp: 3000, progress: (s) => s.totalEarned },
];

// ---------- Objectifs quotidiens ----------
export type DailyKind = 'dust' | 'earn' | 'debris' | 'rare';
export interface DailyDef {
  id: string;
  kind: DailyKind;
  title: string;
  target: number;
  reward: number;
}

export function generateDailies(seed: number, level: number): DailyDef[] {
  // Générateur simple, déterministe par joueur et par jour.
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
  const scale = 1 + (level - 1) * 0.6;
  const pool: DailyDef[] = [
    { id: 'd_dust', kind: 'dust', title: '', target: Math.round((150 + rnd() * 150) * scale), reward: 0 },
    { id: 'd_earn', kind: 'earn', title: '', target: Math.round((200 + rnd() * 200) * scale), reward: 0 },
    { id: 'd_debris', kind: 'debris', title: '', target: Math.round(4 + rnd() * 6), reward: 0 },
    { id: 'd_rare', kind: 'rare', title: '', target: Math.round(3 + rnd() * 5), reward: 0 },
  ];
  // retire un objectif au hasard pour en garder 3
  pool.splice(Math.floor(rnd() * pool.length), 1);
  for (const d of pool) {
    if (d.kind === 'dust') { d.title = `Récolter ${d.target} unités de poussière`; d.reward = Math.round(d.target * 0.8); }
    if (d.kind === 'earn') { d.title = `Gagner ${d.target} crédits en vendant`; d.reward = Math.round(d.target * 0.5); }
    if (d.kind === 'debris') { d.title = `Détruire ${d.target} débris`; d.reward = Math.round(d.target * 25 * scale); }
    if (d.kind === 'rare') { d.title = `Trouver ${d.target} ressources rares`; d.reward = Math.round(d.target * 30 * scale); }
  }
  return pool;
}

export function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
