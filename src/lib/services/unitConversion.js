/**
 * Returns allowed units for a raw material based on its materialType and unit family.
 * - Solid: ["g", "kg"]
 * - Liquid: ["ml", "liter"]
 * - Packaging: ["pcs"]
 * - General or unknown: derive unit family from material's own unit:
 *   g or kg -> ["g", "kg"]
 *   ml or liter -> ["ml", "liter"]
 *   pcs -> ["pcs"]
 *   anything else -> [that unit]
 */
export function getAllowedUnits(material) {
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
 * Converts an entered quantity in enteredUnit to the material's baseUnit.
 * Handles solid (g <-> kg, factor 1000) and liquid (ml <-> liter, factor 1000).
 */
export function convertToBaseUnit(enteredQty, enteredUnit, baseUnit) {
  const qty = Number(enteredQty) || 0;
  if (!enteredUnit || !baseUnit || enteredUnit === baseUnit) {
    return qty;
  }

  const eUnit = enteredUnit.toLowerCase().trim();
  const bUnit = baseUnit.toLowerCase().trim();

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
 * Formats a quantity with unit cleanly (e.g. 250 g or 1.5 kg).
 */
export function formatQuantityWithUnit(qty, unit) {
  const num = Number(qty) || 0;
  const formatted = num % 1 === 0 ? num.toString() : num.toFixed(3).replace(/\.?0+$/, "");
  return `${formatted} ${unit || ""}`.trim();
}
