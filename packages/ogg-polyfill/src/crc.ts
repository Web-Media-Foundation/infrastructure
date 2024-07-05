const getElementFromTable = (idx: number): number => {
  let r: number = idx << 24 >>> 0;
  let i = 0;
  while (i < 8) {
    r = (r << 1 >>> 0) ^ ((r >>> 31) * 0x04c11db7 >>> 0);
    i += 1;
  }
  return r >>> 0;  // Ensure the result is an unsigned 32-bit integer
}

const generateTable = (): Uint32Array => {
  const lupArr: Uint32Array = new Uint32Array(0x100);
  let i = 0;
  while (i < 0x100) {
    lupArr[i] = getElementFromTable(i);
    i += 1;
  }
  return lupArr;
}

const CRC_LOOKUP_ARRAY: Uint32Array = generateTable();

export const vorbisCrc32 = (array: Uint8Array, initial = 0, from = 0, to = array.length): number => {
  let result: number = initial >>> 0;
  for (let i = from; i < to; i += 1) {
    result = ((result << 8 >>> 0) ^ CRC_LOOKUP_ARRAY[(array[i] ^ (result >>> 24)) & 0xff]) >>> 0;
  }
  return result >>> 0;
}
