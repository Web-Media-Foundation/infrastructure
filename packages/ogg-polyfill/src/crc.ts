const getElementFromTable = (idx: number): number => {
  let r: number = idx << 24;
  let i = 0;
  while (i < 8) {
    r = (r << 1) ^ (-(((r >> 31) & 1) as number) & 0x04c11db7);
    i += 1;
  }
  return r;
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

export const updateCrc32 = (array: Uint8Array, initial = 0): number => {
  let result: number = initial;
  for (let i = 0; i < array.length; i += 1) {
    result = (result << 8) ^ CRC_LOOKUP_ARRAY[(array[i] ^ (result >> 24)) & 0xff];
  }
  return result;
}
