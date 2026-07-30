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
import { formatElapsed, scopeQuestionIds } from "./quiz";
import type { CollectionScope, PersistedState, QuizData, QuizQuestion } from "../types";

const REPORT_FONT_URL = "/fonts/Deng-Regular.ttf";
const REPORT_FONT_NAME = "微软雅黑";
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const REPORT_BLUE = "2F6F72";
const REPORT_BLUE_LIGHT = "E7F1F0";
const REPORT_GRAY = "5D6B6B";

export type ReportFormat = "pdf" | "word";

export interface ProgressReportRow {
  question: QuizQuestion;
  status: "待复习" | "已掌握" | "已练习" | "未练习";
  attempts: number;
}

export interface ProgressReport {
  title: string;
  scopeLabel: string;
  pageLabel: string;
  generatedAt: string;
  elapsedSeconds: number;
  total: number;
  attempted: number;
  mastered: number;
  wrong: number;
  accuracy: number;
  rows: ProgressReportRow[];
}

function localDateTime(date = new Date()): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dateStamp(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function download(bytes: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getScopeLabel(data: QuizData, scope: CollectionScope): string {
  if (scope === "all") return "全部词库";
  return data.collections.find((collection) => collection.id === scope)?.label ?? scope;
}

function getPageLabel(pageSelection: string): string {
  if (pageSelection === "all") return "全部页面";
  const [, page, part] = pageSelection.split(":");
  return `Page ${page} · 第 ${part} 组`;
}

export function buildProgressReport(
  data: QuizData,
  state: PersistedState,
  scope: CollectionScope,
  pageSelection: string,
  elapsedSeconds: number,
): ProgressReport {
  const selectedIds = new Set(scopeQuestionIds(data.questions, scope, pageSelection));
  const rows = data.questions
    .filter((question) => selectedIds.has(question.id))
    .map((question) => {
      const progress = state.progress[question.id];
      const status = state.wrongBook[question.id]
        ? "待复习"
        : progress?.mastered
          ? "已掌握"
          : progress?.attempted
            ? "已练习"
            : "未练习";
      return { question, status, attempts: progress?.attempts ?? 0 } as ProgressReportRow;
    });
  const attempted = rows.filter((row) => row.status !== "未练习").length;
  const mastered = rows.filter((row) => row.status === "已掌握").length;
  const wrong = rows.filter((row) => row.status === "待复习").length;
  const correctFirstAttempt = rows.filter(
    (row) => state.progress[row.question.id]?.firstAttemptCorrect === true,
  ).length;

  return {
    title: "雅思听写学习报告",
    scopeLabel: getScopeLabel(data, scope),
    pageLabel: getPageLabel(pageSelection),
    generatedAt: localDateTime(),
    elapsedSeconds,
    total: rows.length,
    attempted,
    mastered,
    wrong,
    accuracy: attempted > 0 ? Math.round((correctFirstAttempt / attempted) * 100) : 0,
    rows,
  };
}

function reportFilename(report: ProgressReport, extension: "pdf" | "docx"): string {
  const safeScope = report.scopeLabel.replaceAll(/[\\/:*?"<>|]/g, "-");
  return `雅思听写-${safeScope}-学习报告-${dateStamp()}.${extension}`;
}

function docxCell(text: string, width: number, options?: { bold?: boolean; color?: string; fill?: string }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options?.fill ? { type: ShadingType.CLEAR, color: options.fill } : undefined,
    margins: { top: 95, bottom: 95, left: 110, right: 110 },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            font: REPORT_FONT_NAME,
            size: 24,
            bold: options?.bold,
            color: options?.color,
          }),
        ],
      }),
    ],
  });
}

export async function exportProgressReportWord(report: ProgressReport): Promise<void> {
  const summary = [
    ["词库范围", `${report.scopeLabel} · ${report.pageLabel}`],
    ["学习用时", formatElapsed(report.elapsedSeconds)],
    ["答题进度", `${report.attempted} / ${report.total}`],
    ["已掌握", `${report.mastered} 词`],
    ["待复习", `${report.wrong} 词`],
    ["首次正确率", `${report.accuracy}%`],
  ];
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D7E1E0" },
  };
  const document = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
        children: [
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: report.title, font: REPORT_FONT_NAME, size: 40, bold: true, color: REPORT_BLUE }),
            ],
          }),
          new Paragraph({
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: `${report.scopeLabel} · ${report.pageLabel} · 导出于 ${report.generatedAt}`,
                font: REPORT_FONT_NAME,
                size: 22,
                color: REPORT_GRAY,
              }),
            ],
          }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            borders,
            rows: summary.map(
              ([label, value]) =>
                new TableRow({
                  children: [
                    docxCell(label, 2500, { bold: true, fill: REPORT_BLUE_LIGHT, color: REPORT_BLUE }),
                    docxCell(value, 6860, { bold: true }),
                  ],
                }),
            ),
          }),
          new Paragraph({
            spacing: { before: 360, after: 150 },
            children: [
              new TextRun({ text: "词汇明细", font: REPORT_FONT_NAME, size: 30, bold: true, color: REPORT_BLUE }),
            ],
          }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            borders,
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  docxCell("#", 600, { bold: true, fill: REPORT_BLUE, color: "FFFFFF" }),
                  docxCell("单词", 2800, { bold: true, fill: REPORT_BLUE, color: "FFFFFF" }),
                  docxCell("释义", 3400, { bold: true, fill: REPORT_BLUE, color: "FFFFFF" }),
                  docxCell("状态", 1500, { bold: true, fill: REPORT_BLUE, color: "FFFFFF" }),
                  docxCell("次数", 1060, { bold: true, fill: REPORT_BLUE, color: "FFFFFF" }),
                ],
              }),
              ...report.rows.map(
                (row, index) =>
                  new TableRow({
                    children: [
                      docxCell(String(index + 1), 600),
                      docxCell(row.question.canonicalAnswer, 2800, { bold: true }),
                      docxCell(row.question.meaningZh, 3400),
                      docxCell(row.status, 1500, {
                        bold: true,
                        color: row.status === "待复习" ? "B54845" : row.status === "已掌握" ? REPORT_BLUE : REPORT_GRAY,
                      }),
                      docxCell(String(row.attempts), 1060),
                    ],
                  }),
              ),
            ],
          }),
        ],
      },
    ],
  });
  download(await Packer.toBlob(document), reportFilename(report, "docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

let reportFontPromise: Promise<ArrayBuffer> | undefined;

function loadReportFont(): Promise<ArrayBuffer> {
  reportFontPromise ??= fetch(REPORT_FONT_URL).then(async (response) => {
    if (!response.ok) throw new Error("报告字体加载失败，请稍后重试。");
    return response.arrayBuffer();
  });
  return reportFontPromise;
}

function splitLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    const candidate = `${line}${character}`;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function createPdfPage(
  document: PDFDocument,
  pageNumber: number,
  font: PDFFont,
): { page: PDFPage; y: number } {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 13, width: PAGE_WIDTH, height: 13, color: rgb(0.18, 0.44, 0.45) });
  page.drawText(`第 ${pageNumber} 页`, { x: PAGE_WIDTH - 88, y: 25, size: 10, font, color: rgb(0.42, 0.47, 0.47) });
  return { page, y: PAGE_HEIGHT - 56 };
}

export async function exportProgressReportPdf(report: ProgressReport): Promise<void> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(await loadReportFont(), { subset: true });
  let pageNumber = 1;
  let { page, y } = createPdfPage(document, pageNumber, font);
  const draw = (text: string, x: number, size: number, color = rgb(0.13, 0.2, 0.2)) => {
    page.drawText(text, { x, y, size, font, color });
  };

  draw(report.title, PAGE_MARGIN, 24, rgb(0.18, 0.44, 0.45));
  y -= 28;
  draw(`${report.scopeLabel} · ${report.pageLabel}`, PAGE_MARGIN, 13, rgb(0.36, 0.42, 0.42));
  y -= 20;
  draw(`导出于 ${report.generatedAt}`, PAGE_MARGIN, 10, rgb(0.42, 0.47, 0.47));
  y -= 28;

  const metrics = [
    [`答题进度`, `${report.attempted}/${report.total}`],
    [`已掌握`, `${report.mastered} 词`],
    [`待复习`, `${report.wrong} 词`],
    [`首次正确率`, `${report.accuracy}%`],
    [`学习用时`, formatElapsed(report.elapsedSeconds)],
  ];
  const cardWidth = CONTENT_WIDTH / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + index * cardWidth;
    page.drawRectangle({ x, y: y - 50, width: cardWidth - 5, height: 50, color: rgb(0.91, 0.95, 0.94) });
    page.drawText(label, { x: x + 8, y: y - 17, size: 9, font, color: rgb(0.36, 0.42, 0.42) });
    page.drawText(value, { x: x + 8, y: y - 38, size: 14, font, color: rgb(0.18, 0.44, 0.45) });
  });
  y -= 78;
  draw("词汇明细", PAGE_MARGIN, 17, rgb(0.18, 0.44, 0.45));
  y -= 22;

  const columns = [
    { label: "#", width: 34 },
    { label: "单词", width: 130 },
    { label: "释义", width: 190 },
    { label: "状态", width: 84 },
    { label: "次数", width: 50 },
  ];
  const rowHeight = 25;
  const drawHeader = () => {
    let x = PAGE_MARGIN;
    columns.forEach((column) => {
      page.drawRectangle({ x, y: y - rowHeight, width: column.width, height: rowHeight, color: rgb(0.18, 0.44, 0.45) });
      page.drawText(column.label, { x: x + 7, y: y - 16, size: 10, font, color: rgb(1, 1, 1) });
      x += column.width;
    });
    y -= rowHeight;
  };
  drawHeader();

  for (const [index, row] of report.rows.entries()) {
    const meaningLines = splitLine(row.question.meaningZh, font, 10, columns[2].width - 12);
    const height = Math.max(rowHeight, 10 + meaningLines.length * 13);
    if (y - height < 48) {
      pageNumber += 1;
      ({ page, y } = createPdfPage(document, pageNumber, font));
      drawHeader();
    }
    let x = PAGE_MARGIN;
    const values = [String(index + 1), row.question.canonicalAnswer, row.question.meaningZh, row.status, String(row.attempts)];
    values.forEach((value, columnIndex) => {
      const column = columns[columnIndex];
      page.drawRectangle({
        x,
        y: y - height,
        width: column.width,
        height,
        borderColor: rgb(0.84, 0.88, 0.87),
        borderWidth: 0.6,
        color: index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.99, 0.99),
      });
      const lines = splitLine(value, font, 10, column.width - 12);
      lines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: x + 6,
          y: y - 16 - lineIndex * 13,
          size: 10,
          font,
          color:
            columnIndex === 3 && row.status === "待复习"
              ? rgb(0.71, 0.28, 0.27)
              : columnIndex === 3 && row.status === "已掌握"
                ? rgb(0.18, 0.44, 0.45)
                : rgb(0.13, 0.2, 0.2),
        });
      });
      x += column.width;
    });
    y -= height;
  }
  const bytes = await document.save();
  const pdfBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  download(pdfBytes, reportFilename(report, "pdf"), "application/pdf");
}
