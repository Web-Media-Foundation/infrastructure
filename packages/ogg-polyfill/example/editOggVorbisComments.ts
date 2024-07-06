/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
import { IVorbisCommentHeader, OggVorbisPage } from "../src/OggVorbisPage";
import { IOggVorbisPage, IOggVorbiseHeaderCommentParseResult, readOggVorbisFile } from "../src/fetchOggVorbisFile";
import { downloadBuffer } from "./utils/downloadBuffer";

const fields = [
  'TITLE', 'VERSION', 'ALBUM', 'TRACKNUMBER', 'ARTIST', 'PERFORMER',
  'COPYRIGHT', 'LICENSE', 'ORGANIZATION', 'DESCRIPTION', 'GENRE',
  'DATE', 'LOCATION', 'CONTACT', 'ISRC', 'ENCODER'
];

let globalOggVorbisFile: IOggVorbisPage[] | null = null;
let globalCommentsPageIndex: number | null = null;
let globalCommentsIndex: number | null = null;

const $fileInput = document.getElementById('fileInput') as HTMLInputElement | null;
if (!$fileInput) throw new Error(`fileInput not found`);

const $fieldsContainer = document.getElementById('fieldsContainer') as HTMLDivElement | null;
if (!$fieldsContainer) throw new Error(`editorPanel not found`);

const $editorPanel = document.getElementById('editorPanel') as HTMLDivElement | null;
if (!$editorPanel) throw new Error(`editorPanel not found`);

const $submitButton = document.getElementById('submitButton') as HTMLButtonElement | null;
$submitButton?.classList.add('topcoat-button--large--cta');
if (!$submitButton) throw new Error(`submitButton not found`);

async function collectOggVorbisFile(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  tolerate = false,
  headerSearchRange = 3
): Promise<IOggVorbisPage[]> {
  const result: IOggVorbisPage[] = [];

  for await (const pageResult of readOggVorbisFile(reader, tolerate, headerSearchRange)) {
    result.push(pageResult);
  }

  return result;
}

function createInputGroup(field: string, value: string) {
  const $inputGroup = document.createElement('div');
  $inputGroup.className = 'input-group';

  const $input = document.createElement('input');
  $input.type = 'text';
  $input.name = field;
  $input.value = value;
  $input.classList.add('topcoat-text-input--large');

  const $removeButton = document.createElement('button');
  $removeButton.textContent = 'Remove';
  $removeButton.addEventListener('click', () => $inputGroup.remove());
  $removeButton.classList.add('topcoat-button--large');

  $inputGroup.appendChild($input);
  $inputGroup.appendChild($removeButton);

  return $inputGroup;
}

const wrapText = (input: string, lineLength = 36) => {
  let result = '';
  for (let i = 0; i < input.length; i += lineLength) {
    result += `${input.slice(i, i + lineLength)}\n`;
  }
  return result;
}

export const dumpBuffer = (x: Uint8Array) => {
  return wrapText([...x].map((y) => y.toString(16).padStart(2, '0')).join(' '))
}

$fileInput.addEventListener('change', async () => {
  const file = $fileInput.files?.[0];
  if (!file) return;

  const reader = (file.stream() as unknown as ReadableStream<Uint8Array>).getReader();
  const result = await collectOggVorbisFile(reader);

  globalOggVorbisFile = result;

  const commentsPageIndex = result.findIndex(page => page.packets.some((packet) => packet.type === 'comment')) ?? null;
  globalCommentsPageIndex = commentsPageIndex;

  const globalCommentsPage = result[globalCommentsPageIndex];

  const commentsPacketIndex = globalCommentsPage?.packets.findIndex((packet) => packet.type === 'comment') as number;
  const commentsPacket = globalCommentsPage?.packets?.[commentsPacketIndex] as IOggVorbiseHeaderCommentParseResult | null;
  globalCommentsIndex = commentsPacketIndex;

  const { comments } = commentsPacket?.data ?? {} as IVorbisCommentHeader;

  $fieldsContainer.innerHTML = '';

  fields.forEach((field) => {
    const $fieldDiv = document.createElement('div');
    $fieldDiv.className = 'field';
    $fieldDiv.innerHTML = `<label>${field}</label>`;

    const $valueDiv = document.createElement('div');
    $valueDiv.className = 'value';
    $fieldDiv.appendChild($valueDiv);

    const values = comments[field] || [''];
    values.forEach(value => {
      const inputGroup = createInputGroup(field, value);
      $valueDiv.appendChild(inputGroup);
    });

    const $addButton = document.createElement('button');
    $addButton.textContent = 'Add';
    $addButton.classList.add('topcoat-button--large');
    $addButton.addEventListener('click', () => {
      const inputGroup = createInputGroup(field, '');
      $valueDiv.insertBefore(inputGroup, $addButton);
    });

    $valueDiv.appendChild($addButton);
    $fieldsContainer.appendChild($fieldDiv);
  });

  $editorPanel.style.display = 'block';
});

$submitButton.addEventListener('click', async () => {
  if (!globalOggVorbisFile) return;
  if (!globalCommentsPageIndex) {
    alert('No comments page found');
    return;
  }

  const newComments: IVorbisCommentHeader["comments"] = {};
  fields.forEach((field) => {
    const inputs = Array.from(document.querySelectorAll(`.field input[name="${field}"]`)) as HTMLInputElement[];
    newComments[field] = inputs
      .map((input) => input.value)
      .filter((value) => value);
  });

  if (globalCommentsIndex === null) throw new TypeError('globalCommentsIndex not found');

  if (globalCommentsPageIndex !== -1) {
    const globalCommentsPage = globalOggVorbisFile[globalCommentsPageIndex];

    const newCommentHeader = {
      vendor: (globalCommentsPage.packets[globalCommentsIndex] as IOggVorbiseHeaderCommentParseResult).data.vendor,
      comments: newComments
    };
    const newCommentSegment = OggVorbisPage.buildComments(newCommentHeader);
    const newPage = globalCommentsPage.page.replacePageSegment(newCommentSegment, globalCommentsIndex);

    globalCommentsPage.page = newPage;
  }

  const totalLength = globalOggVorbisFile.reduce((acc, page) => acc + page.page.buffer.byteLength, 0);
  const newBuffer = new Uint8Array(totalLength);
  let offset = 0;
  globalOggVorbisFile.forEach(page => {
    newBuffer.set(new Uint8Array(page.page.buffer), offset);
    offset += page.page.buffer.byteLength;
  });

  downloadBuffer(newBuffer, 'edited-file.ogg');
});
