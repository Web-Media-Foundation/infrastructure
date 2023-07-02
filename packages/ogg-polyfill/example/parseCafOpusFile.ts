import { fetchCafOpusFile } from "../src/fetchCafOpusFile";
import { cafExample } from "./@example";

(async () => {
  const x = fetchCafOpusFile(cafExample, true);

  let done = false;
  let data: unknown = null;

  const assertUint8Array = (x: Uint8Array, y: Uint8Array) => {
    if (x.byteLength != y.byteLength) {
      throw new RangeError(`Data size not match`);
    }

    for (var i = 0; i != x.byteLength; i++) {
      if (x[i] != y[i]) {
        throw new TypeError(`Data not match at position ${i}`);
      }
    }

    return true;
  };

  while (!done) {
    const { done: d, value: v } = await x.next();

    done = !!d;
    data = v;

    console.log(data);

    // Let's test if the code is correctly encoded.
    if (v) {
      const expected =
        v.header.chunkType === "#header" ? 8 : v.chunk.byteLength - 12;
      if (v.header.chunkSize !== BigInt(expected)) {
        throw new TypeError(
          `"byteLength" property not match for "${v.header.chunkType}", expected ${v.header.chunkSize} but got ${expected} bytes`
        );
      }

      const encodedChunk = v.chunk.encode();

      if (encodedChunk.byteLength !== v.raw.byteLength) {
        throw new TypeError(
          `Chunk size not match for "${v.header.chunkType}", expected ${v.header.chunkSize} but got ${expected} bytes`
        );
      }

      try {
        assertUint8Array(encodedChunk, v.raw);
      } catch (e) {
        if (!(e instanceof Error)) throw e;
        e.message = `Corrupted file in "${v.header.chunkType}", ${e.message}`;

        throw e;
      }
    }
  }
})();
