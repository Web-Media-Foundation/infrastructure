import {
  IOggHeaderParseResult,
  IOggPacketsParseResult,
  IOggTagsParseResult,
  fetchOggOpusFile,
} from "../src/fetchOggOpusFile";
import { oggExample } from "./@example";

(async () => {
  const x = fetchOggOpusFile(oggExample);

  let done = false;
  let data:
    | IOggHeaderParseResult
    | IOggTagsParseResult
    | IOggPacketsParseResult
    | null = null;

  let packetCount = 0;

  while (!done) {
    const { done: d, value: v } = await x.next();

    done = !!d;
    data = v;

    if (data?.type === "packets") {
      packetCount += data.data.length;
    }

    console.log(data);
  }
})();
