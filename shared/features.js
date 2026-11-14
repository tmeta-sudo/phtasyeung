// Room features (ticks, no price) and paid add-ons (ticked per tenant, billed every month).

export const ROOM_FEATURES = [
  { id: 'ac', icon: '❄️', km: 'ម៉ាស៊ីនត្រជាក់' },
  { id: 'fan', icon: '🌀', km: 'កង្ហារ' },
  { id: 'hotwater', icon: '🚿', km: 'ទឹកក្តៅ' },
  { id: 'bathroom', icon: '🚽', km: 'បន្ទប់ទឹកក្នុង' },
  { id: 'bed', icon: '🛏️', km: 'គ្រែ + ពូក' },
  { id: 'wardrobe', icon: '🗄️', km: 'ទូខោអាវ' },
  { id: 'fridge', icon: '🧊', km: 'ទូទឹកកក' },
  { id: 'kitchen', icon: '🍳', km: 'កន្លែងចម្អិន' },
  { id: 'tv', icon: '📺', km: 'ទូរទស្សន៍' },
  { id: 'wifi', icon: '📶', km: 'Wi-Fi' },
  { id: 'balcony', icon: '🌇', km: 'រានហាល' },
  { id: 'window', icon: '🪟', km: 'បង្អួច' },
  { id: 'washer', icon: '🫧', km: 'ម៉ាស៊ីនបោកខោអាវ' },
  { id: 'security', icon: '📹', km: 'កាមេរ៉ា / សន្តិសុខ' },
];
export const FEATURE_IDS = new Set(ROOM_FEATURES.map((f) => f.id));

export const DEFAULT_ADDONS = [
  { id: 'moto', icon: '🛵', label: 'ចំណតម៉ូតូ', price: 5, max: 5 },
  { id: 'car', icon: '🚗', label: 'ចំណតឡាន', price: 25, max: 3 },
  { id: 'bike', icon: '🚲', label: 'ចំណតកង់', price: 2, max: 5 },
  { id: 'wifi', icon: '📶', label: 'អ៊ីនធឺណិត Wi-Fi', price: 5, max: 1 },
  { id: 'trash', icon: '🗑️', label: 'សំរាម', price: 2, max: 1 },
  { id: 'aircon', icon: '❄️', label: 'ថ្លៃម៉ាស៊ីនត្រជាក់', price: 15, max: 3 },
  { id: 'laundry', icon: '🧺', label: 'បោកអ៊ុត', price: 10, max: 1 },
  { id: 'cleaning', icon: '🧹', label: 'សម្អាតបន្ទប់', price: 10, max: 1 },
];
