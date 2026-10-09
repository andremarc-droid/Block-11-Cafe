/**
 * PACK SIZE ("pcs" for solids and liquids)
 * ----------------------------------------
 * A raw material is always stocked, costed and deducted by recipes in its BASE unit (g, kg, ml or
 * liter). The POS relies on that, so it never changes. A material may optionally carry a `packSize`:
 * how many BASE units one piece contains (e.g. a 226 g container of powder with base unit "g" has
 * packSize 226, i.e. 1 pcs = 226 g). When a pack size is set, "pcs" becomes an extra unit the admin can
 * ENTER quantities in (restock, recipes); it is converted to the base unit immediately, so nothing
 * downstream ever sees pcs for these materials.
 */

/** Pack size in base units, or 0 when the material has none (or it is invalid). */
export function getPackSize(material) {
  const size = Number(material?.packSize);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/** True when it makes sense to give this material a pack size: anything not already counted in pcs. */
export function supportsPackSize(materialType, unit) {
  const u = (unit || "").trim().toLowerCase();
  return materialType !== "Packaging" && u !== "pcs" && u !== "";
}

/** Rounds away binary floating-point noise (0.1 * 3 -> 0.30000000000000004) without losing real precision. */
function tidy(value) {
  return Math.round(value * 10000) / 10000;
}

function getBaseAllowedUnits(material) {
  if (!material) return ["pcs"];
  const type = material.materialType;
  if (type === "Solid") return ["g", "kg"];
  if (type === "Liquid") return ["ml", "liter"];
  if (type === "Packaging") return ["pcs"];

  // General or unknown: derive from material's own unit
  const unit = (material.unit || "").trim().toLowerCase();
  if (unit === "g" || unit === "kg") return ["g", "kg"];
  if (unit === "ml" || unit === "liter" || unit === "l") return ["ml", "liter"];
  if (unit === "pcs") return ["pcs"];
  return [material.unit || "pcs"];
}

/**
 * Returns the units a quantity may be entered in for a raw material.
 * - Solid: ["g", "kg"]; Liquid: ["ml", "liter"]; Packaging: ["pcs"]
 * - General or unknown: derived from the material's own unit
 * - Any of the above, plus "pcs", when the material has a pack size (1 pcs = N base units)
 */
export function getAllowedUnits(material) {
  const units = getBaseAllowedUnits(material);
  if (getPackSize(material) > 0 && !units.includes("pcs")) {
    return [...units, "pcs"];
  }
  return units;
}

/**
 * Converts an entered quantity in enteredUnit to the material's baseUnit.
 * Handles solid (g <-> kg, factor 1000), liquid (ml <-> liter, factor 1000) and, when `material`
 * has a pack size, pcs -> base unit (qty x packSize).
 */
export function convertToBaseUnit(enteredQty, enteredUnit, baseUnit, material = null) {
  const qty = Number(enteredQty) || 0;
  if (!enteredUnit || !baseUnit || enteredUnit === baseUnit) {
    return qty;
  }

  const eUnit = enteredUnit.toLowerCase().trim();
  const bUnit = baseUnit.toLowerCase().trim();

  // Pieces of a packed material: 1 pcs = packSize base units
  if (eUnit === "pcs" && bUnit !== "pcs") {
    const pack = getPackSize(material);
    return pack > 0 ? tidy(qty * pack) : qty;
  }

  // Solid: g <-> kg
  if (eUnit === "g" && (bUnit === "kg" || bUnit === "kilogram")) {
    return qty / 1000;
  }
  if ((eUnit === "kg" || eUnit === "kilogram") && bUnit === "g") {
    return qty * 1000;
  }

  // Liquid: ml <-> liter / l
  if (eUnit === "ml" && (bUnit === "liter" || bUnit === "l")) {
    return qty / 1000;
  }
  if ((eUnit === "liter" || eUnit === "l") && bUnit === "ml") {
    return qty * 1000;
  }

  return qty;
}

/**
 * How many pieces a quantity in the material's base unit is, e.g. 678 (g) of a 226 g pack -> 3.
 * Returns null when the material has no pack size.
 */
export function baseQtyToPcs(material, baseQty) {
  const pack = getPackSize(material);
  if (pack <= 0) return null;
  return tidy((Number(baseQty) || 0) / pack);
}

/**
 * "≈ 3 pcs" style text for a base-unit quantity, or "" when the material has no pack size.
 */
export function formatPcsEquivalent(material, baseQty) {
  const pcs = baseQtyToPcs(material, baseQty);
  if (pcs === null) return "";
  const text = pcs % 1 === 0 ? pcs.toString() : pcs.toFixed(2).replace(/\.?0+$/, "");
  return `≈ ${text} pcs`;
}

/**
 * Formats a quantity with unit cleanly (e.g. 250 g or 1.5 kg).
 */
export function formatQuantityWithUnit(qty, unit) {
  const num = Number(qty) || 0;
  const formatted = num % 1 === 0 ? num.toString() : num.toFixed(3).replace(/\.?0+$/, "");
  return `${formatted} ${unit || ""}`.trim();
}
