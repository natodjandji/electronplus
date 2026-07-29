export interface VenezuelaState {
  name: string;
  cities: string[];
}

export const VENEZUELA_STATES: VenezuelaState[] = [
  { name: "Amazonas", cities: ["Puerto Ayacucho", "La Esmeralda", "San Fernando de Atabapo"] },
  { name: "Anzoátegui", cities: ["Barcelona", "Puerto La Cruz", "Lechería", "El Tigre", "Anaco"] },
  { name: "Apure", cities: ["San Fernando de Apure", "Guasdualito", "Achaguas"] },
  { name: "Aragua", cities: ["Maracay", "Turmero", "La Victoria", "Cagua", "El Limón"] },
  { name: "Barinas", cities: ["Barinas", "Barinitas", "Socopó"] },
  {
    name: "Bolívar",
    cities: ["Ciudad Bolívar", "Ciudad Guayana", "Upata", "Santa Elena de Uairén"],
  },
  {
    name: "Carabobo",
    cities: ["Valencia", "Puerto Cabello", "Naguanagua", "Guacara", "San Diego"],
  },
  { name: "Cojedes", cities: ["San Carlos", "Tinaquillo", "Tinaco"] },
  { name: "Delta Amacuro", cities: ["Tucupita"] },
  {
    name: "Distrito Capital",
    cities: ["Caracas", "El Hatillo", "Baruta", "Chacao", "Sucre (Petare)"],
  },
  { name: "Falcón", cities: ["Coro", "Punto Fijo", "Santa Ana de Coro", "Tucacas"] },
  { name: "Guárico", cities: ["San Juan de los Morros", "Valle de la Pascua", "Calabozo"] },
  { name: "La Guaira", cities: ["La Guaira", "Catia La Mar", "Maiquetía", "Macuto"] },
  { name: "Lara", cities: ["Barquisimeto", "Cabudare", "Carora", "El Tocuyo"] },
  { name: "Mérida", cities: ["Mérida", "Ejido", "El Vigía", "Tovar"] },
  {
    name: "Miranda",
    cities: ["Los Teques", "Guarenas", "Guatire", "Charallave", "Ocumare del Tuy"],
  },
  { name: "Monagas", cities: ["Maturín", "Punta de Mata", "Caripito"] },
  { name: "Nueva Esparta", cities: ["La Asunción", "Porlamar", "Pampatar", "Juan Griego"] },
  { name: "Portuguesa", cities: ["Guanare", "Acarigua", "Araure", "Villa Bruzual"] },
  { name: "Sucre", cities: ["Cumaná", "Carúpano", "Güiria"] },
  { name: "Táchira", cities: ["San Cristóbal", "Táriba", "La Fría", "Rubio"] },
  { name: "Trujillo", cities: ["Trujillo", "Valera", "Boconó"] },
  { name: "Yaracuy", cities: ["San Felipe", "Yaritagua", "Chivacoa"] },
  { name: "Zulia", cities: ["Maracaibo", "Cabimas", "Ciudad Ojeda", "Santa Bárbara del Zulia"] },
];

export const VENEZUELA_STATE_NAMES = VENEZUELA_STATES.map((s) => s.name);

export function citiesForState(stateName: string): string[] {
  return VENEZUELA_STATES.find((s) => s.name === stateName)?.cities ?? [];
}
