import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";

const MATERIALS_COLLECTION = "rawMaterials";
const MOVEMENTS_COLLECTION = "stockMovements";

/**
 * Live-subscribes to the rawMaterials collection. onChange fires with the
 * full, current array every time anything changes — this is the source of
 * truth the Total Inventory Valuation is derived from, so that figure is
 * always computed off live data rather than a stored/frozen number.
 */
export function subscribeToMaterials(onChange, onError) {
  const materialsQuery = query(
    collection(db, MATERIALS_COLLECTION),
    orderBy("name")
  );

  return onSnapshot(
    materialsQuery,
    (snapshot) => {
      const materials = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      onChange(materials);
    },
    onError
  );
}

/**
 * Creates a brand-new raw material. Not one of the three replicated flows —
 * added only so the list has a way to get its first rows. Starting stock and
 * cost become the WAC baseline going forward.
 */
export async function createMaterial(fields, userId) {
  await addDoc(collection(db, MATERIALS_COLLECTION), {
    name: fields.name,
    category: fields.category,
    materialType: fields.materialType,
    unit: fields.unit,
    stockQty: fields.stockQty,
    costPerUnit: fields.costPerUnit,
    minStockAlert: fields.minStockAlert,
    createdBy: userId,
    createdAt: serverTimestamp(),
  });
}

/**
 * EDIT flow — a plain overwrite of any field, including stockQty and
 * costPerUnit. No blending logic: this is for correcting mistakes, not for
 * restocking. Use restockMaterial() for adding stock.
 */
export async function saveMaterialEdit(materialId, fields) {
  const materialRef = doc(db, MATERIALS_COLLECTION, materialId);
  await updateDoc(materialRef, {
    name: fields.name,
    category: fields.category,
    materialType: fields.materialType,
    unit: fields.unit,
    stockQty: fields.stockQty,
    costPerUnit: fields.costPerUnit,
    minStockAlert: fields.minStockAlert,
  });
}

/**
 * QUICK RESTOCK flow — read-modify-write done atomically via a Firestore
 * transaction, mirroring the SQL `SELECT ... FOR UPDATE` + transaction
 * pattern from the WPF app's RawMaterialRepository.RestockWithWacAsync:
 * the material doc is read, the Weighted Average Cost is computed from
 * that read, and both the new stockQty/costPerUnit and the stockMovements
 * log entry are written back in the same transaction. Firestore retries
 * the whole transaction automatically if another restock lands first, so
 * two concurrent restocks on the same material can't clobber each other.
 *
 * addQty must already be validated as > 0. restockCost is the cost for
 * THIS restock event specifically (defaulting to the material's current
 * cost happens one layer up, in the UI, per the "blank cost = no price
 * change" rule).
 */
export async function restockMaterial({ materialId, addQty, restockCost, userId }) {
  const materialRef = doc(db, MATERIALS_COLLECTION, materialId);
  const movementRef = doc(collection(db, MOVEMENTS_COLLECTION));

  return runTransaction(db, async (transaction) => {
    const materialSnap = await transaction.get(materialRef);
    if (!materialSnap.exists()) {
      throw new Error("This material no longer exists — it may have been deleted.");
    }

    const data = materialSnap.data();
    const existingQty = Number(data.stockQty) || 0;
    const existingCost = Number(data.costPerUnit) || 0;
    const newQty = existingQty + addQty;

    // Edge case: nothing to blend against when existing stock is 0 — the
    // new cost is simply the restock cost.
    const newCost =
      existingQty <= 0
        ? restockCost
        : (existingQty * existingCost + addQty * restockCost) / newQty;

    transaction.update(materialRef, {
      stockQty: newQty,
      costPerUnit: newCost,
    });

    transaction.set(movementRef, {
      rawMaterialId: materialId,
      userId,
      changeQty: addQty,
      costPerUnitAtTime: restockCost,
      movementType: "Restock",
      notes: "",
      timestamp: serverTimestamp(),
    });

    return { newQty, newCost };
  });
}
