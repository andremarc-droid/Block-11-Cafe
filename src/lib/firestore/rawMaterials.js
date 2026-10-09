import {
  addDoc,
  collection,
  deleteDoc,
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

// Two-way sync with the desktop POS (see FirebaseSyncService.cs in the POS app).
// The POS tags every write it makes with lastModifiedBy = "pos" and its live listener
// IGNORES any change still carrying that tag (it assumes it's just its own push echoing
// back). Because updateDoc()/transaction.update() only touch the fields you pass, a web
// edit that doesn't explicitly overwrite this tag leaves the old "pos" value in place
// and the POS silently discards the edit. So EVERY web write to rawMaterials must stamp
// lastModifiedBy = "web" (plus updatedAt) so the POS knows to apply it.
const SYNC_TAG_FIELD = "lastModifiedBy";
const SYNC_TAG_VALUE = "web";

export function subscribeToMaterials(onChange, onError) {
  const materialsQuery = query(
    collection(db, MATERIALS_COLLECTION),
    orderBy("name")
  );
  return onSnapshot(
    materialsQuery,
    (snapshot) => {
      const materials = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .filter((m) => m.isActive !== false);
      onChange(materials);
    },
    onError
  );
}

export async function createMaterial(fields, userId) {
  await addDoc(collection(db, MATERIALS_COLLECTION), {
    name: fields.name,
    category: fields.category,
    materialType: fields.materialType,
    unit: fields.unit,
    stockQty: fields.stockQty,
    costPerUnit: fields.costPerUnit,
    minStockAlert: fields.minStockAlert,
    // How many base units 1 pcs holds (e.g. 226 for a 226 g container), or null. Optional; the POS ignores it.
    packSize: fields.packSize ?? null,
    createdBy: userId,
    createdAt: serverTimestamp(),
    [SYNC_TAG_FIELD]: SYNC_TAG_VALUE,
    updatedAt: serverTimestamp(),
  });
}

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
    packSize: fields.packSize ?? null,
    [SYNC_TAG_FIELD]: SYNC_TAG_VALUE,
    updatedAt: serverTimestamp(),
  });
}

/**
 * DELETE flow — permanently removes the material document from Firestore.
 * Stock movements referencing this material are left intact for audit history.
 */
export async function deleteMaterial(materialId) {
  const materialRef = doc(db, MATERIALS_COLLECTION, materialId);
  await deleteDoc(materialRef);
}

/**
 * QUICK RESTOCK flow — read-modify-write done atomically via a Firestore
 * transaction. The material doc is read, WAC is computed, and both the
 * updated stockQty/costPerUnit and the stockMovements log entry are written
 * back in the same transaction.
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

    const newCost =
      existingQty <= 0
        ? restockCost
        : (existingQty * existingCost + addQty * restockCost) / newQty;

    transaction.update(materialRef, {
      stockQty: newQty,
      costPerUnit: newCost,
      [SYNC_TAG_FIELD]: SYNC_TAG_VALUE,
      updatedAt: serverTimestamp(),
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
