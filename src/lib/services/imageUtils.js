/**
 * Image processing service for Menu item photos.
 * Rules:
 * - Accept JPG/PNG up to 10 MB.
 * - Resize client-side with a canvas to a longest side of 720px on a white background.
 * - Encode JPEG at quality 0.85 and step down to 0.45 until <= 200 KB.
 * - If still > 200 KB, shrink dimensions by 20% and retry up to 4 times.
 * - Store as data:image/jpeg;base64,...
 * - Refuse to save if length > 700,000 characters.
 */
export async function processImageFile(file) {
  if (!file) return null;

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Photo must be 10 MB or less.");
  }

  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("File must be an image (JPG or PNG).");
  }

  const img = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to decode the image file."));
      image.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

  let maxDim = 720;
  const TARGET_BYTE_SIZE = 200 * 1024; // 200 KB
  const MAX_CHAR_LIMIT = 700000;
  let bestDataUrl = null;

  // Initial attempt (maxDim 720) + up to 4 shrink attempts (20% reduction each)
  for (let attempt = 0; attempt <= 4; attempt++) {
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width > height) {
      if (width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      }
    } else {
      if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Step down quality from 0.85 to 0.45 in steps of ~0.1
    const qualitySteps = [0.85, 0.75, 0.65, 0.55, 0.45];
    for (const q of qualitySteps) {
      const dataUrl = canvas.toDataURL("image/jpeg", q);
      bestDataUrl = dataUrl;

      // Approximate byte size: base64 length * 0.75
      const approxBytes = Math.round(dataUrl.length * 0.75);
      if (approxBytes <= TARGET_BYTE_SIZE) {
        if (dataUrl.length > MAX_CHAR_LIMIT) {
          throw new Error("Image exceeds the maximum allowed size (700,000 characters).");
        }
        return dataUrl;
      }
    }

    // Shrink longest dimension by 20% for next iteration
    maxDim = Math.round(maxDim * 0.8);
  }

  if (bestDataUrl && bestDataUrl.length <= MAX_CHAR_LIMIT) {
    return bestDataUrl;
  }

  throw new Error("Image is too large to save (exceeds 700,000 characters). Please choose a smaller photo.");
}
