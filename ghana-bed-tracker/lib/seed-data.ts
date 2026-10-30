/**
 * Seed catalogue: Ghana's 16 regions and a representative set of hospitals.
 *
 * NOTE ON DATA: facility names, regions, towns and coordinates are real, but
 * bed capacities, phone numbers and e-mail addresses are ILLUSTRATIVE values
 * chosen to be plausible for each facility type. They are not an official
 * Ghana Health Service / Ministry of Health feed. In production this table is
 * replaced by the GHS facility registry + live ward reporting.
 */
import type { FacilityType, Ownership, Region } from "./types";

export const REGIONS: Region[] = [
  { id: "ahafo", name: "Ahafo", capital: "Goaso" },
  { id: "ashanti", name: "Ashanti", capital: "Kumasi" },
  { id: "bono", name: "Bono", capital: "Sunyani" },
  { id: "bono_east", name: "Bono East", capital: "Techiman" },
  { id: "central", name: "Central", capital: "Cape Coast" },
  { id: "eastern", name: "Eastern", capital: "Koforidua" },
  { id: "greater_accra", name: "Greater Accra", capital: "Accra" },
  { id: "north_east", name: "North East", capital: "Nalerigu" },
  { id: "northern", name: "Northern", capital: "Tamale" },
  { id: "oti", name: "Oti", capital: "Dambai" },
  { id: "savannah", name: "Savannah", capital: "Damongo" },
  { id: "upper_east", name: "Upper East", capital: "Bolgatanga" },
  { id: "upper_west", name: "Upper West", capital: "Wa" },
  { id: "volta", name: "Volta", capital: "Ho" },
  { id: "western", name: "Western", capital: "Sekondi-Takoradi" },
  { id: "western_north", name: "Western North", capital: "Sefwi Wiawso" },
];

export interface SeedFacility {
  id: string;
  name: string;
  region: string;
  district: string;
  town: string;
  type: FacilityType;
  ownership: Ownership;
  beds: number;
  lat: number;
  lon: number;
}

function h(
  id: string,
  name: string,
  region: string,
  district: string,
  town: string,
  type: FacilityType,
  ownership: Ownership,
  beds: number,
  lat: number,
  lon: number,
): SeedFacility {
  return { id, name, region, district, town, type, ownership, beds, lat, lon };
}

export const FACILITIES: SeedFacility[] = [
  // ── Greater Accra ────────────────────────────────────────────────
  h("korle-bu", "Korle Bu Teaching Hospital", "greater_accra", "Ablekuma South", "Accra", "Teaching", "Government (MoH)", 1800, 5.5597, -0.2325),
  h("ridge-regional", "Ridge Regional Hospital", "greater_accra", "Ablekuma Central", "Accra", "Regional", "Government (GHS)", 420, 5.5708, -0.2075),
  h("37-military", "37 Military Hospital", "greater_accra", "Okaikoi South", "Accra", "Military", "Military", 350, 5.58, -0.19),
  h("tema-general", "Tema General Hospital", "greater_accra", "Tema Metropolitan", "Tema", "Municipal", "Government (GHS)", 300, 5.667, -0.017),
  h("la-general", "La General Hospital", "greater_accra", "La Nkwantanang Madina", "Accra", "Municipal", "Government (GHS)", 160, 5.61, -0.183),
  h("ga-east", "Ga East Municipal Hospital", "greater_accra", "Ga East", "Amasaman", "Municipal", "Government (GHS)", 130, 5.687, -0.306),
  h("ga-south", "Ga South Municipal Hospital", "greater_accra", "Ga South", "Weija", "Municipal", "Government (GHS)", 120, 5.585, -0.4),
  h("tetteh-quarshie", "Tetteh Quarshie General Hospital", "greater_accra", "La Nkwantanang Madina", "Madina", "Municipal", "Government (GHS)", 110, 5.683, -0.166),
  h("ashaiman-municipal", "Ashaiman Municipal Hospital", "greater_accra", "Ashaiman", "Ashaiman", "Municipal", "Government (GHS)", 100, 5.69, -0.035),
  h("ada-district", "Ada District Hospital", "greater_accra", "Ada East", "Ada Foah", "District", "Government (GHS)", 80, 5.783, 0.633),
  h("dodowa-government", "Dodowa Government Hospital", "greater_accra", "Shai Osudoku", "Dodowa", "District", "Government (GHS)", 85, 5.867, -0.15),
  h("police-hospital", "Ghana Police Hospital", "greater_accra", "Osu", "Accra", "Specialist", "Government (GHS)", 150, 5.583, -0.177),
  h("accra-psychiatric", "Accra Psychiatric Hospital", "greater_accra", "Ablekuma South", "Accra", "Psychiatric", "Government (MoH)", 200, 5.534, -0.214),
  h("pantang-psychiatric", "Pantang Psychiatric Hospital", "greater_accra", "Ashaiman", "Pantang", "Psychiatric", "Government (MoH)", 160, 5.683, -0.117),
  h("nyaho-medical", "Nyaho Medical Centre", "greater_accra", "Airport City", "Accra", "Private", "Private", 60, 5.606, -0.175),
  h("lister-hospital", "Lister Hospital & Fertility Centre", "greater_accra", "Spintex", "Accra", "Private", "Private", 50, 5.635, -0.11),
  h("trust-hospital", "Trust Hospital", "greater_accra", "Osu", "Accra", "Private", "Private", 45, 5.556, -0.181),

  // ── Ashanti ──────────────────────────────────────────────────────
  h("komfo-anokye", "Komfo Anokye Teaching Hospital", "ashanti", "Kumasi Metropolitan", "Kumasi", "Teaching", "Government (MoH)", 1200, 6.69, -1.624),
  h("manhyia-government", "Manhyia Government Hospital", "ashanti", "Kumasi Metropolitan", "Kumasi", "Municipal", "Government (GHS)", 160, 6.705, -1.618),
  h("tafo-government", "Tafo Government Hospital", "ashanti", "Kumasi Metropolitan", "Kumasi", "Municipal", "Government (GHS)", 130, 6.71, -1.58),
  h("kumasi-south", "Kumasi South Hospital", "ashanti", "Kumasi Metropolitan", "Kumasi", "Municipal", "Government (GHS)", 150, 6.65, -1.61),
  h("ejisu-government", "Ejisu Government Hospital", "ashanti", "Ejisu Municipal", "Ejisu", "Municipal", "Government (GHS)", 120, 6.716, -1.465),
  h("bekwai-government", "Bekwai Government Hospital", "ashanti", "Bekwai Municipal", "Bekwai", "Municipal", "Government (GHS)", 100, 6.453, -1.577),
  h("offinso-st-marys", "St. Mary's Hospital, Offinso", "ashanti", "Offinso Municipal", "Offinso", "Mission", "Mission (CHAG)", 105, 6.95, -1.65),
  h("konongo-government", "Konongo Government Hospital", "ashanti", "Asante Akim Central", "Konongo", "District", "Government (GHS)", 95, 6.767, -1.217),
  h("asamang-sda", "Asamang SDA Hospital", "ashanti", "Amansie West", "Asamang", "Mission", "Mission (CHAG)", 90, 6.8, -1.6),

  // ── Western ──────────────────────────────────────────────────────
  h("effia-nkwanta", "Effia Nkwanta Regional Hospital", "western", "Sekondi-Takoradi", "Sekondi-Takoradi", "Regional", "Government (GHS)", 360, 4.934, -1.768),
  h("tarkwa-government", "Tarkwa Government Hospital", "western", "Tarkwa Nsuaem", "Tarkwa", "Municipal", "Government (GHS)", 150, 5.305, -2.005),
  h("axim-general", "Axim General Hospital", "western", "Nzema East", "Axim", "District", "Government (GHS)", 120, 4.87, -2.24),
  h("eikwe-st-martin", "St. Martin de Porres Hospital, Eikwe", "western", "Nzema East", "Eikwe", "Mission", "Mission (CHAG)", 125, 5.03, -2.54),
  h("half-assini", "Half Assini Government Hospital", "western", "Jomoro", "Half Assini", "District", "Government (GHS)", 80, 5.06, -2.99),
  h("prestea-government", "Prestea Government Hospital", "western", "Prestea Huni Valley", "Prestea", "District", "Government (GHS)", 90, 5.433, -2.133),

  // ── Western North ────────────────────────────────────────────────
  h("sefwi-wiawso", "Sefwi Wiawso Government Hospital", "western_north", "Sefwi Wiawso", "Sefwi Wiawso", "Municipal", "Government (GHS)", 120, 6.2, -2.5),
  h("bibiani-government", "Bibiani Government Hospital", "western_north", "Bibiani Anhwiaso Bekwai", "Bibiani", "Municipal", "Government (GHS)", 115, 6.467, -2.317),
  h("enchi-government", "Enchi Government Hospital", "western_north", "Aowin", "Enchi", "District", "Government (GHS)", 80, 6.083, -2.9),

  // ── Central ──────────────────────────────────────────────────────
  h("cape-coast-teaching", "Cape Coast Teaching Hospital", "central", "Cape Coast Metropolitan", "Cape Coast", "Teaching", "Government (MoH)", 520, 5.12, -1.29),
  h("ucc-university", "University Hospital, UCC", "central", "Cape Coast Metropolitan", "Cape Coast", "Specialist", "University", 100, 5.115, -1.28),
  h("cape-coast-metro", "Cape Coast Metropolitan Hospital", "central", "Cape Coast Metropolitan", "Cape Coast", "Municipal", "Government (GHS)", 150, 5.105, -1.245),
  h("assin-foso", "Assin Foso Government Hospital", "central", "Assin North", "Assin Foso", "District", "Government (GHS)", 100, 5.683, -1.567),
  h("winneba-trauma", "Trauma & Specialist Hospital, Winneba", "central", "Effutu Municipal", "Winneba", "Specialist", "Government (MoH)", 140, 5.345, -0.625),
  h("mankessim-sda", "Mankessim SDA Hospital", "central", "Mfantseman", "Mankessim", "Mission", "Mission (CHAG)", 85, 5.433, -1.15),

  // ── Eastern ──────────────────────────────────────────────────────
  h("koforidua-regional", "Koforidua Regional Hospital", "eastern", "New Juaben", "Koforidua", "Regional", "Government (GHS)", 300, 6.094, -0.259),
  h("nkawkaw-government", "Nkawkaw Government Hospital", "eastern", "Kwahu South", "Nkawkaw", "Municipal", "Government (GHS)", 150, 6.55, -0.767),
  h("akim-oda", "Akim Oda Government Hospital", "eastern", "Birim Central", "Akim Oda", "Municipal", "Government (GHS)", 140, 5.933, -0.983),
  h("kyebi-government", "Kyebi Government Hospital", "eastern", "Birim South", "Kyebi", "District", "Government (GHS)", 110, 6.167, -0.55),
  h("abetifi-presbyterian", "Abetifi Presbyterian Hospital", "eastern", "Kwahu East", "Abetifi", "Mission", "Mission (CHAG)", 105, 6.7, -0.45),
  h("somanya-government", "Somanya Government Hospital", "eastern", "Kwaebibirem", "Somanya", "District", "Government (GHS)", 90, 6.4, -0.417),
  h("suhum-government", "Suhum Government Hospital", "eastern", "Suhum Municipal", "Suhum", "District", "Government (GHS)", 95, 6.05, -0.45),

  // ── Volta ────────────────────────────────────────────────────────
  h("ho-teaching", "Ho Teaching Hospital", "volta", "Ho Municipal", "Ho", "Teaching", "Government (MoH)", 380, 6.605, 0.471),
  h("hohoe-municipal", "Hohoe Municipal Hospital", "volta", "Hohoe Municipal", "Hohoe", "Municipal", "Government (GHS)", 150, 7.15, 0.483),
  h("keta-government", "Keta Government Hospital", "volta", "Keta Municipal", "Keta", "District", "Government (GHS)", 120, 5.917, 0.983),
  h("sogakope-district", "Sogakope District Hospital", "volta", "South Tongu", "Sogakope", "District", "Government (GHS)", 80, 6.007, 0.592),
  h("kpandu-margret", "St. Margaret Mariani Hospital, Kpandu", "volta", "Kpandu Municipal", "Kpandu", "Mission", "Mission (CHAG)", 95, 6.997, 0.293),

  // ── Oti ──────────────────────────────────────────────────────────
  h("dambai-municipal", "Dambai Municipal Hospital", "oti", "Krachi East", "Dambai", "Municipal", "Government (GHS)", 100, 8.02, 0.01),
  h("nkwanta-district", "Nkwanta District Hospital", "oti", "Nkwanta North", "Nkwanta", "District", "Government (GHS)", 95, 8.083, 0.55),
  h("jasikan-district", "Jasikan District Hospital", "oti", "Jasikan", "Jasikan", "District", "Government (GHS)", 70, 7.4, 0.433),
  h("kadjebi-district", "Kadjebi District Hospital", "oti", "Kadjebi", "Kadjebi", "District", "Government (GHS)", 65, 7.467, 0.15),

  // ── Northern ─────────────────────────────────────────────────────
  h("tamale-teaching", "Tamale Teaching Hospital", "northern", "Tamale Metropolitan", "Tamale", "Teaching", "Government (MoH)", 420, 9.407, -0.853),
  h("tamale-west", "Tamale West Hospital", "northern", "Tamale Metropolitan", "Tamale", "Municipal", "Government (GHS)", 130, 9.4, -0.87),
  h("yendi-municipal", "Yendi Municipal Hospital", "northern", "Yendi Municipal", "Yendi", "Municipal", "Government (GHS)", 120, 9.443, -0.01),
  h("zabzugu-district", "Zabzugu District Hospital", "northern", "Zabzugu", "Zabzugu", "District", "Government (GHS)", 60, 9.45, -0.267),

  // ── Savannah ─────────────────────────────────────────────────────
  h("damongo-district", "Damongo District Hospital", "savannah", "West Gonja", "Damongo", "District", "Government (GHS)", 85, 9.083, -1.817),
  h("salaga-district", "Salaga District Hospital", "savannah", "East Gonja", "Salaga", "District", "Government (GHS)", 90, 8.55, -0.517),
  h("bole-district", "Bole District Hospital", "savannah", "Bole", "Bole", "District", "Government (GHS)", 60, 9.033, -2.483),

  // ── North East ───────────────────────────────────────────────────
  h("nalerigu-wusam", "Nalerigu (Wusam) Hospital", "north_east", "East Mamprusi", "Nalerigu", "District", "Government (GHS)", 90, 10.533, -0.417),
  h("walewale-district", "Walewale District Hospital", "north_east", "West Mamprusi", "Walewale", "District", "Government (GHS)", 75, 10.3, -0.8),
  h("bunkpurugu-district", "Bunkpurugu District Hospital", "north_east", "Bunkpurugu Nyankpanduri", "Bunkpurugu", "District", "Government (GHS)", 60, 10.583, -0.183),

  // ── Upper East ───────────────────────────────────────────────────
  h("bolgatanga-regional", "Bolgatanga Regional Hospital", "upper_east", "Bolgatanga Municipal", "Bolgatanga", "Regional", "Government (GHS)", 260, 10.786, -0.851),
  h("bawku-presbyterian", "Bawku Presbyterian Hospital", "upper_east", "Bawku Municipal", "Bawku", "Mission", "Mission (CHAG)", 150, 11.062, -0.242),
  h("navrongo-war-memorial", "Navrongo War Memorial Hospital", "upper_east", "Kassena Nankana West", "Navrongo", "District", "Government (GHS)", 120, 10.89, -1.09),
  h("zebilla-district", "Zebilla District Hospital", "upper_east", "Bawku West", "Zebilla", "District", "Government (GHS)", 70, 10.95, -0.45),
  h("bongo-district", "Bongo District Hospital", "upper_east", "Bongo", "Bongo", "District", "Government (GHS)", 55, 10.9, -0.8),

  // ── Upper West ───────────────────────────────────────────────────
  h("wa-regional", "Wa Regional Hospital", "upper_west", "Wa Municipal", "Wa", "Regional", "Government (GHS)", 250, 10.06, -2.5),
  h("jirapa-st-josephs", "St. Joseph's Hospital, Jirapa", "upper_west", "Jirapa", "Jirapa", "Mission", "Mission (CHAG)", 110, 10.283, -2.717),
  h("lawra-district", "Lawra District Hospital", "upper_west", "Lawra", "Lawra", "District", "Government (GHS)", 75, 10.65, -2.883),
  h("tumu-district", "Tumu District Hospital", "upper_west", "Sissala East", "Tumu", "District", "Government (GHS)", 70, 10.883, -1.967),

  // ── Bono ─────────────────────────────────────────────────────────
  h("sunyani-regional", "Sunyani Regional Hospital", "bono", "Sunyani Municipal", "Sunyani", "Regional", "Government (GHS)", 300, 7.34, -2.33),
  h("berekum-presbyterian", "Berekum Presbyterian Hospital", "bono", "Berekum East", "Berekum", "Mission", "Mission (CHAG)", 120, 7.45, -2.7),
  h("wenchi-methodist", "Wenchi Methodist Hospital", "bono", "Wenchi Municipal", "Wenchi", "Mission", "Mission (CHAG)", 115, 7.733, -2.1),

  // ── Bono East ────────────────────────────────────────────────────
  h("kintampo-municipal", "Kintampo Municipal Hospital", "bono_east", "Kintampo North", "Kintampo", "Municipal", "Government (GHS)", 110, 8.05, -1.73),
  h("techiman-st-elizabeth", "St. Elizabeth Catholic Hospital, Techiman", "bono_east", "Techiman Municipal", "Techiman", "Mission", "Mission (CHAG)", 130, 7.583, -1.933),
  h("nkoranza-presbyterian", "Nkoranza Presbyterian Hospital", "bono_east", "Nkoranza South", "Nkoranza", "Mission", "Mission (CHAG)", 105, 7.983, -1.85),

  // ── Ahafo ────────────────────────────────────────────────────────
  h("goaso-municipal", "Goaso Municipal Hospital", "ahafo", "Asunafo North", "Goaso", "Municipal", "Government (GHS)", 105, 6.8, -2.517),
  h("duayaw-nkwanta-st-theresa", "St. Theresa's Hospital, Duayaw Nkwanta", "ahafo", "Asutifi North", "Duayaw Nkwanta", "Mission", "Mission (CHAG)", 120, 6.95, -2.15),
  h("bechem-district", "Bechem District Hospital", "ahafo", "Tano South", "Bechem", "District", "Government (GHS)", 70, 7.083, -2.033),
];

/** Ward mix used to derive ward capacities from a facility's total bed count. */
export const WARD_CATEGORIES: {
  id: string;
  label: string;
  share: number;
  min: number;
  /** Facility types that get this ward at all. */
  types?: FacilityType[];
}[] = [
  { id: "general_male", label: "General Ward — Male", share: 0.22, min: 6 },
  { id: "general_female", label: "General Ward — Female", share: 0.22, min: 6 },
  { id: "maternity", label: "Maternity / Obstetrics", share: 0.14, min: 4, types: ["Teaching", "Regional", "Municipal", "District", "Mission", "Private", "Specialist", "Military"] },
  { id: "paediatric", label: "Paediatric Ward", share: 0.11, min: 4, types: ["Teaching", "Regional", "Municipal", "District", "Mission", "Private", "Specialist", "Military"] },
  { id: "surgical", label: "Surgical Ward", share: 0.11, min: 3, types: ["Teaching", "Regional", "Municipal", "District", "Mission", "Private", "Military"] },
  { id: "emergency", label: "Emergency / Observation", share: 0.07, min: 3 },
  { id: "icu", label: "ICU / HDU", share: 0.04, min: 2, types: ["Teaching", "Regional", "Municipal", "Private", "Specialist", "Military"] },
  { id: "orthopaedic", label: "Orthopaedic Ward", share: 0.05, min: 4, types: ["Teaching", "Regional"] },
  { id: "isolation", label: "Isolation Unit", share: 0.04, min: 2 },
];

/** Demo staff accounts (password for all demo users: `BedTrack2026!`). */
export const DEMO_USERS: {
  username: string;
  name: string;
  role: "ward_staff" | "facility_admin" | "national";
  facility: string | null;
}[] = [
  { username: "moh.national", name: "Dr. Nana Adjoa Mensah", role: "national", facility: null },
  { username: "korlebu.admin", name: "Mr. Kwesi Boateng", role: "facility_admin", facility: "korle-bu" },
  { username: "korlebu.ward", name: "Sr. Abena Owusu", role: "ward_staff", facility: "korle-bu" },
  { username: "kath.admin", name: "Mr. Yaw Darko", role: "facility_admin", facility: "komfo-anokye" },
  { username: "tamale.ward", name: "Sr. Fatima Iddrisu", role: "ward_staff", facility: "tamale-teaching" },
  { username: "ridge.admin", name: "Mrs. Efua Sarpong", role: "facility_admin", facility: "ridge-regional" },
];
