import { Unzip, UnzipInflate } from "fflate";
import * as XLSX from "xlsx";
import {
  hardImportLimits,
  type ImportLimits,
  type ImportCell,
} from "./online-import-types";
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function inspectOnlineArchive(bytes: Uint8Array, limits: ImportLimits) {
  if (bytes.length > limits.bytes || bytes.length < 22)
    throw Error("Arquivo vazio ou acima do limite.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw Error("XLSX/ZIP incompatível ou corrompido.");
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    offset = view.getUint32(end + 16, true);
  if (!count || count > 2000 || offset + size !== end)
    throw Error("Estrutura ZIP inválida ou excessiva.");
  const entries = new Map<string, { size: number; crc: number }>();
  let cursor = offset,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw Error("Diretório ZIP corrompido.");
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      compressed = view.getUint32(cursor + 20, true),
      expanded = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true),
      local = view.getUint32(cursor + 42, true);
    if (
      cursor + 46 + nameLength + extra + comment > end ||
      local + 30 > offset ||
      view.getUint32(local, true) !== 0x04034b50
    )
      throw Error("Entrada ZIP inválida.");
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (
      entries.has(name) ||
      name.includes("..") ||
      name.includes("\\") ||
      name.startsWith("/") ||
      /vbaProject|activeX|externalLinks|embeddings/i.test(name) ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      throw Error("Arquivo contém conteúdo não permitido.");
    if (
      expanded > limits.expanded ||
      (compressed === 0 && expanded > 0) ||
      expanded > Math.max(1024, compressed * 200)
    )
      throw Error("Expansão ZIP excessiva.");
    const dataStart =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    if (
      dataStart + compressed > offset ||
      view.getUint16(local + 8, true) !== method ||
      view.getUint16(local + 6, true) & 1
    )
      throw Error("Dados ZIP inconsistentes.");
    total += expanded;
    if (total > limits.expanded)
      throw Error("Conteúdo descompactado acima do limite.");
    entries.set(name, {
      size: expanded,
      crc: view.getUint32(cursor + 16, true),
    });
    cursor += 46 + nameLength + extra + comment;
  }
  if (
    cursor !== end ||
    !entries.has("[Content_Types].xml") ||
    !entries.has("xl/workbook.xml")
  )
    throw Error("Selecione um XLSX OOXML válido.");
  let actualTotal = 0;
  const complete = new Set<string>(),
    xmls = new Map<string, string>(),
    seen = new Set<string>();
  const unzip = new Unzip((file) => {
    const expected = entries.get(file.name);
    if (!expected || seen.has(file.name))
      throw Error("Conteúdo ZIP inesperado.");
    seen.add(file.name);
    let length = 0,
      crc = 0xffffffff;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) throw Error("Falha ao descompactar XLSX.");
      length += chunk.length;
      actualTotal += chunk.length;
      if (length > expected.size || actualTotal > limits.expanded)
        throw Error("Expansão ZIP acima do limite.");
      for (const value of chunk)
        crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
      if (/\.xml$/.test(file.name)) chunks.push(chunk);
      if (final) {
        if (
          length !== expected.size ||
          (crc ^ 0xffffffff) >>> 0 !== expected.crc
        )
          throw Error("Integridade ZIP inválida.");
        complete.add(file.name);
        if (chunks.length) {
          const output = new Uint8Array(length);
          let at = 0;
          for (const chunk of chunks) {
            output.set(chunk, at);
            at += chunk.length;
          }
          xmls.set(file.name, decoder.decode(output));
        }
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let i = 0; i < bytes.length; i += 4096)
    unzip.push(bytes.subarray(i, i + 4096), i + 4096 >= bytes.length);
  if (complete.size !== entries.size) throw Error("Arquivo ZIP incompleto.");
  let strings = 0,
    cells = 0;
  for (const [name, xml] of xmls) {
    if (
      /<!DOCTYPE|<!ENTITY/i.test(xml) ||
      (name === "[Content_Types].xml" &&
        /<Override\b[^>]*ContentType=["'][^"']*(?:macroEnabled|vbaProject)/i.test(
          xml,
        ))
    )
      throw Error("Conteúdo XML ativo não permitido.");
    if (
      name === "xl/workbook.xml" &&
      (xml.match(/<sheet\b/g) || []).length > limits.sheets
    )
      throw Error("Quantidade de abas acima do limite.");
    if (name === "xl/sharedStrings.xml") {
      strings = (xml.match(/<si\b/g) || []).length;
      if (strings > 100000) throw Error("Excesso de textos compartilhados.");
    }
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      for (const match of xml.matchAll(
        /<c\b[^>]*\br=["']([A-Z]+)([0-9]+)["']/g,
      )) {
        let col = 0;
        for (const char of match[1]) col = col * 26 + char.charCodeAt(0) - 64;
        if (col > limits.columns || Number(match[2]) > limits.rows + 1)
          throw Error("Planilha excede o limite de linhas ou colunas.");
        if (++cells > (limits.rows + 1) * limits.columns * limits.sheets)
          throw Error("Excesso de células.");
      }
      if (
        (xml.match(/<c\b/g) || []).length !==
        [...xml.matchAll(/<c\b[^>]*\br=["']([A-Z]+)([0-9]+)["']/g)].length
      )
        throw Error("Célula sem endereço explícito.");
    }
  }
}
export function parseOnlineWorkbook(
  buffer: ArrayBuffer,
  limits: ImportLimits = hardImportLimits,
) {
  inspectOnlineArchive(new Uint8Array(buffer), limits);
  const book = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    cellFormula: true,
    cellHTML: false,
    cellDates: true,
    cellNF: true,
    sheetRows: limits.rows + 2,
    WTF: true,
  });
  if (!book.SheetNames.length || book.SheetNames.length > limits.sheets)
    throw Error("Quantidade de abas inválida.");
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    const range = XLSX.utils.decode_range(
      sheet["!fullref"] || sheet["!ref"] || "A1",
    );
    if (range.e.r > limits.rows || range.e.c >= limits.columns)
      throw Error("Limite de dimensões excedido.");
    const rows: ImportCell[][] = [];
    for (let r = 0; r <= range.e.r; r++) {
      const row: ImportCell[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        let text = cell ? String(cell.v ?? "") : "";
        let error: string | undefined;
        if (cell?.f || cell?.t === "e" || cell?.t === "d" || cell?.t === "b")
          error = "Fórmula, erro, data ou booleano não aceito.";
        if (
          cell?.t === "n" &&
          (!Number.isFinite(cell.v) ||
            Math.abs(cell.v) > Number.MAX_SAFE_INTEGER ||
            String(cell.v).replace(/[^0-9]/g, "").length > 15)
        )
          error =
            "Número de alta precisão deve ser armazenado como texto no Excel.";
        if (cell?.t === "n" && cell.z && /^0{2,}$/.test(cell.z))
          text = XLSX.utils.format_cell(cell);
        if (text.length > 240) error = "Célula acima de 240 caracteres.";
        row.push({ text, ...(error ? { error } : {}) });
      }
      rows.push(row);
    }
    return { name, rows };
  });
}
