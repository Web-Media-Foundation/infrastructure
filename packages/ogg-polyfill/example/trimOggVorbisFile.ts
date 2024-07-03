/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */

import { IOggVorbisPage, readOggVorbisFile } from "../src/fetchOggVorbisFile";

async function trimOggVorbisFile(reader: ReadableStreamDefaultReader<Uint8Array>, tolerate = false, headerSearchRange = 3): Promise<IOggVorbisPage[]> {
  const result: IOggVorbisPage[] = [];
  let headerFound = false;

  for await (const pageResult of readOggVorbisFile(reader, tolerate, headerSearchRange)) {
    if (!headerFound) {
      let foundHeaderIndex = -1;

      for (let i = 0; i < pageResult.packets.length; i += 1) {
        const packet = pageResult.packets[i];
        if (packet.type === 'identification' || packet.type === 'comment' || packet.type === 'setup') {
          foundHeaderIndex = i;
          headerFound = true;
          break;
        }
      }

      if (foundHeaderIndex === -1) {
        // If no headers found, continue to the next page
        continue;
      } else {
        // Remove segments before the first header packet
        for (let i = 0; i < foundHeaderIndex; i += 1) {
          pageResult.page = pageResult.page.removePageSegment(0);
        }

        pageResult.packets.slice(foundHeaderIndex);
      }
    }

    result.push(pageResult);
  }

  return result;
}

function downloadBuffer(buffer: Uint8Array, filename: string) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const $fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');

if ($fileInput) {
  $fileInput.addEventListener('change', async () => {
    const { files } = $fileInput;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = (file.stream() as unknown as ReadableStream<Uint8Array>).getReader();

      try {
        const result = await trimOggVorbisFile(reader);

        // Calculate the total length of the new buffer
        const totalLength = result.reduce((acc, page) => acc + page.page.buffer.byteLength, 0);

        // Create the new buffer and fill it with the pages' buffers
        const newBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const page of result) {
          newBuffer.set(new Uint8Array(page.page.buffer), offset);
          offset += page.page.buffer.byteLength;
        }

        // Create a new filename with the "trimmed" suffix
        const newFilename = file.name.replace(/(\.[\w\d_-]+)$/i, '-trimmed$1');

        // Download the new buffer as a file
        downloadBuffer(newBuffer, newFilename);

        console.log('File trimmed and downloaded successfully.');
      } catch (error) {
        console.error(error);
        alert('Error processing file!');
      } finally {
        $fileInput.value = '';
      }
    }
  });
}

export default {};