export const concatenateUint8Arrays = (array1: Uint8Array, array2: Uint8Array) => {
  const mergedArray = new Uint8Array(array1.length + array2.length);

  mergedArray.set(array1, 0);

  mergedArray.set(array2, array1.length);

  return mergedArray;
}
