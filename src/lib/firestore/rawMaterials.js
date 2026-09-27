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
