import fontkit from "@pdf-lib/fontkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { buildWrongBookExport } from "./wrongBookExport";
import type { PersistedState, QuizData } from "../types";

const FONT_URL = "/fonts/Deng-Regular.ttf";
const FONT_NAME = "微软雅黑";
const BLUE = "2F6F72";
const BLUE_LIGHT = "E7F1F0";
const GRAY = "5D6B6B";
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export type WrongBookReportFormat = "pdf" | "word";

export interface WrongBookReportRow {
  word: string;
  meaning: string;
  source: string;
  wrongCount: number;
  latestWrongAt: string;
}

export interface WrongBookReport {
  title: string;
  subtitle: string;
  exportedAt: string;
  totalEntries: number;
  totalErrors: number;
  highestWrongCount: number;
  latestWrongAt: string;
  rows: WrongBookReportRow[];
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--"
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}

function stamp(): string {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function download(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function buildWrongBookReport(data: QuizData, state: PersistedState): WrongBookReport {
  const exported = buildWrongBookExport(data, state);
  const rows = exported.entries.map((entry) => ({
    word: entry.canonicalAnswer,
    meaning: `${entry.partOfSpeech} ${entry.meaningZh}`.trim(),
    source: `${entry.collectionLabel} · Page ${entry.page}`,
    wrongCount: entry.wrongCount,
    latestWrongAt: formatTime(entry.errorTimestamps.at(-1) ?? entry.addedAt),
  }));
  return {
    title: "雅思听写错题报告",
    subtitle: "全部词库 · 当前错题本",
    exportedAt: formatTime(exported.exportedAt),
    totalEntries: exported.totalEntries,
    totalErrors: exported.totalErrorEvents,
    highestWrongCount: Math.max(...rows.map((row) => row.wrongCount), 0),
    latestWrongAt: rows[0]?.latestWrongAt ?? "--",
    rows,
  };
}

function filename(extension: "pdf" | "docx"): string {
  return `雅思听写-错题报告-${stamp()}.${extension}`;
}

function cell(text: string, width: number, options?: { bold?: boolean; color?: string; fill?: string }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options?.fill ? { type: ShadingType.CLEAR, color: options.fill } : undefined,
    margins: { top: 90, bottom: 90, left: 105, right: 105 },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text, font: FONT_NAME, size: 23, bold: options?.bold, color: options?.color })],
      }),
    ],
  });
}

export async function exportWrongBookReportWord(report: WrongBookReport): Promise<void> {
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
  };
  const summary = [
    ["错词数量", `${report.totalEntries} 词`],
    ["错误总次数", `${report.totalErrors} 次`],
    ["单词最高错误", `${report.highestWrongCount} 次`],
    ["最近记录", report.latestWrongAt],
  ];
  const document = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children: [
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: report.title, font: FONT_NAME, size: 40, bold: true, color: BLUE })] }),
        new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `${report.subtitle} · 导出于 ${report.exportedAt}`, font: FONT_NAME, size: 22, color: GRAY })] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA }, borders,
          rows: summary.map(([label, value]) => new TableRow({ children: [cell(label, 2500, { bold: true, fill: BLUE_LIGHT, color: BLUE }), cell(value, 6860, { bold: true })] })),
        }),
        new Paragraph({ spacing: { before: 360, after: 150 }, children: [new TextRun({ text: "错题明细", font: FONT_NAME, size: 30, bold: true, color: BLUE })] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA }, borders,
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                cell("#", 580, { bold: true, fill: BLUE, color: "FFFFFF" }), cell("单词", 2200, { bold: true, fill: BLUE, color: "FFFFFF" }),
                cell("释义", 2700, { bold: true, fill: BLUE, color: "FFFFFF" }), cell("来源", 2000, { bold: true, fill: BLUE, color: "FFFFFF" }),
                cell("错误", 900, { bold: true, fill: BLUE, color: "FFFFFF" }), cell("最近记录", 980, { bold: true, fill: BLUE, color: "FFFFFF" }),
              ],
            }),
            ...report.rows.map((row, index) => new TableRow({ children: [
              cell(String(index + 1), 580), cell(row.word, 2200, { bold: true }), cell(row.meaning, 2700), cell(row.source, 2000),
              cell(`${row.wrongCount} 次`, 900, { bold: true, color: "B54845" }), cell(row.latestWrongAt, 980),
            ] })),
          ],
        }),
      ],
    }],
  });
  download(await Packer.toBlob(document), filename("docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

let fontPromise: Promise<ArrayBuffer> | undefined;

function loadFont(): Promise<ArrayBuffer> {
  fontPromise ??= fetch(FONT_URL).then(async (response) => {
    if (!response.ok) throw new Error("报告字体加载失败，请稍后重试。");
    return response.arrayBuffer();
  });
  return fontPromise;
}

function splitLine(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    const candidate = `${line}${character}`;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = character;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function createPage(document: PDFDocument, font: PDFFont, number: number): { page: PDFPage; y: number } {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 13, width: PAGE_WIDTH, height: 13, color: rgb(0.18, 0.44, 0.45) });
  page.drawText(`第 ${number} 页`, { x: PAGE_WIDTH - 88, y: 25, size: 10, font, color: rgb(0.42, 0.47, 0.47) });
  return { page, y: PAGE_HEIGHT - 56 };
}

export async function exportWrongBookReportPdf(report: WrongBookReport): Promise<void> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(await loadFont(), { subset: true });
  let pageNumber = 1;
  let { page, y } = createPage(document, font, pageNumber);
  const text = (value: string, x: number, size: number, color = rgb(0.13, 0.2, 0.2)) => page.drawText(value, { x, y, size, font, color });
  text(report.title, MARGIN, 24, rgb(0.18, 0.44, 0.45));
  y -= 28;
  text(report.subtitle, MARGIN, 13, rgb(0.36, 0.42, 0.42));
  y -= 20;
  text(`导出于 ${report.exportedAt}`, MARGIN, 10, rgb(0.42, 0.47, 0.47));
  y -= 28;
  const metrics = [["错词数量", `${report.totalEntries} 词`], ["错误总次数", `${report.totalErrors} 次`], ["最高错误", `${report.highestWrongCount} 次`], ["最近记录", report.latestWrongAt]];
  const metricWidth = CONTENT_WIDTH / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = MARGIN + index * metricWidth;
    page.drawRectangle({ x, y: y - 50, width: metricWidth - 5, height: 50, color: rgb(0.91, 0.95, 0.94) });
    page.drawText(label, { x: x + 8, y: y - 17, size: 9, font, color: rgb(0.36, 0.42, 0.42) });
    page.drawText(value, { x: x + 8, y: y - 38, size: 13, font, color: rgb(0.18, 0.44, 0.45) });
  });
  y -= 78;
  text("错题明细", MARGIN, 17, rgb(0.18, 0.44, 0.45));
  y -= 22;
  const columns = [{ label: "#", width: 30 }, { label: "单词", width: 100 }, { label: "释义", width: 160 }, { label: "来源", width: 115 }, { label: "错误", width: 48 }, { label: "最近记录", width: 89 }];
  const header = () => {
    let x = MARGIN;
    columns.forEach((column) => { page.drawRectangle({ x, y: y - 25, width: column.width, height: 25, color: rgb(0.18, 0.44, 0.45) }); page.drawText(column.label, { x: x + 6, y: y - 16, size: 9, font, color: rgb(1, 1, 1) }); x += column.width; });
    y -= 25;
  };
  header();
  for (const [index, row] of report.rows.entries()) {
    const values = [String(index + 1), row.word, row.meaning, row.source, String(row.wrongCount), row.latestWrongAt];
    const lines = values.map((value, columnIndex) => splitLine(value, font, 9, columns[columnIndex].width - 10));
    const height = Math.max(25, 10 + Math.max(...lines.map((value) => value.length)) * 12);
    if (y - height < 48) { pageNumber += 1; ({ page, y } = createPage(document, font, pageNumber)); header(); }
    let x = MARGIN;
    lines.forEach((cellLines, columnIndex) => {
      const column = columns[columnIndex];
      page.drawRectangle({ x, y: y - height, width: column.width, height, borderColor: rgb(0.84, 0.88, 0.87), borderWidth: 0.6, color: index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.99, 0.99) });
      cellLines.forEach((line, lineIndex) => page.drawText(line, { x: x + 5, y: y - 15 - lineIndex * 12, size: 9, font, color: columnIndex === 4 ? rgb(0.71, 0.28, 0.27) : rgb(0.13, 0.2, 0.2) }));
      x += column.width;
    });
    y -= height;
  }
  const bytes = await document.save();
  download(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, filename("pdf"), "application/pdf");
}
