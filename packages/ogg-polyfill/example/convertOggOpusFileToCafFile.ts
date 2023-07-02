import { fetchOggOpusFile } from "../src/fetchOggOpusFile";
import { oggOpusToCaf } from "../src/oggOpusToCaf";
import { oggExample } from "./@example";

(async () => {
  const x = fetchOggOpusFile(oggExample);
  const caf = oggOpusToCaf(x, true);

  let done = false;
  let data: Uint8Array[] = [];

  while (!done) {
    const { done: d, value: v } = await caf.next();

    done = !!d;
    if (v) {
      console.log(v.chunk);
      data.push(v.raw);
    }
  }

  const cafFileSize = data.reduce((acc, curr) => acc + curr.byteLength, 0);
  const cafBinaryData = new Uint8Array(cafFileSize);

  let offset = 0;

  for (const chunk of data) {
    cafBinaryData.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const blob = new Blob([cafBinaryData], {
    type: "audio/x-caf",
  });
  const url = window.URL.createObjectURL(blob);

  const $a = document.createElement("a");
  $a.href = url;
  $a.download = "repacked.caf";
  $a.innerText = "Download parsed file";
  document.body.appendChild($a);
})();
