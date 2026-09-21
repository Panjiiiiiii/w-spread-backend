import { Prisma, StatementBank, StatementUploadStatus, TransactionType } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { StorageService } from './storage.service';

const RAW_TEXT_PREVIEW_LENGTH = 2000;

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  type: 'CR' | 'DB';
}

export interface ExpenseCategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface StatementSummary {
  id: string;
  fileName: string;
  status: StatementUploadStatus;
  errorMessage: string | null;
  bank: StatementBank;
  periodStart: Date | null;
  periodEnd: Date | null;
  transactionCount: number;
  monthlyAvgRevenue: number | null;
  monthlyAvgExpense: number | null;
  totalMonths: number;
  createdAt: Date;
  topExpenseCategories: ExpenseCategoryBreakdown[];
}

const MONTH_NAMES_ID: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11,
};

// A transaction block starts with "DD/MM <description...>" (BCA's actual
// mutation layout has no year on the date; the statement's period supplies
// the year via detectStatementYear).
const BLOCK_START_PATTERN = /^(\d{1,2})\/(\d{1,2})\s+(.+)$/;

// A bare, unformatted amount line, e.g. "1500000.00" or "16000.00" — this is
// pdf-parse's flattened rendering of the amount that visually sits in a
// separate column from the date/description in the original PDF table.
// Deliberately excludes thousands-separator commas so it doesn't collide
// with the formatted amount+balance line below.
const BARE_AMOUNT_LINE = /^\d+(?:\.\d{1,2})?$/;

// The formatted "MUTASI" (and optionally "SALDO") line that closes a block,
// e.g. "22,000.00 DB 3,946,288.89", "100,000.00 514,776.89", "22,000.00".
// Group 2 (DB) is present only for debits; absent for credits.
const FORMATTED_AMOUNT_LINE = /^([\d,]+\.\d{2})\s*(DB)?\s*(?:[\d,]+\.\d{2})?$/i;

// Repeated per-page letterhead, disclaimers, and pagination noise that must
// never be mistaken for a transaction block. Matched against the full,
// whitespace-normalized line.
const BOILERPLATE_PATTERNS: RegExp[] = [
  /^REKENING TAHAPAN/i,
  /^K\s*C\s*U\s+/i,
  /^KCU\s+/i,
  /^SUKUN$/i,
  /^RT\d/i,
  /^JL\.\s/i,
  /^MALANG\s/i,
  /^INDONESIA$/i,
  /^NO\.\s*REKENING/i,
  /^HALAMAN\s*:/i,
  /^PERIODE\s*:/i,
  /^MATA UANG\s*:/i,
  /^FASILITAS\s*:/i,
  /^KETERANGAN\s*:/i,
  /^C\s*A\s*T\s*A\s*T\s*A\s*N\s*:/i,
  /^A\s+p\s+a\s+b\s+i\s+l\s+a/i, // the letter-spaced disclaimer paragraph
  /^R\s+e\s+k\s+e\s+n\s+i\s+n\s+g/i,
  /^t\s+e\s+l\s+a\s+h/i,
  /^L\s+a\s+p\s+o\s+r\s+a\s+n/i,
  /^•/,
  /^TANGGAL\s+KETERANGAN/i,
  /^\d{1,3}\s*\/\s*\d{1,3}$/, // page-number line, e.g. "1 /10"
  /^--\s*\d+\s+of\s+\d+\s*--$/i,
  /^Bersambung ke halaman berikut$/i,
];

// Block-terminating summary lines. These carry the account's own totals
// (used for validation) but are never individual transactions.
const SUMMARY_LINE_PATTERN = /^(SALDO AWAL|SALDO AKHIR|MUTASI CR|MUTASI DB)\s*:/i;

function isBoilerplate(line: string): boolean {
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line));
}

function parseFormattedAmount(raw: string): number {
  // "1.250.000,50" (Mandiri/BRI-style) or "1,250,000.00" (BCA-style) -> 1250000.5 / 1250000
  const normalized = raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
    ? raw.replace(/\./g, '').replace(',', '.') // "1.250.000,50" style
    : raw.replace(/,/g, ''); // "1,250,000.00" style
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parseBareAmount(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function parseDate(day: number, month: number, statementYearHint: number): Date | null {
  if (!Number.isFinite(day) || !Number.isFinite(month)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(statementYearHint, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectBank(text: string): StatementBank {
  const upper = text.toUpperCase();
  if (upper.includes('BANK CENTRAL ASIA') || upper.includes('BCA')) return StatementBank.BCA;
  if (upper.includes('BANK MANDIRI') || upper.includes('MANDIRI')) return StatementBank.MANDIRI;
  if (upper.includes('BANK RAKYAT INDONESIA') || upper.includes(' BRI ') || upper.startsWith('BRI')) {
    return StatementBank.BRI;
  }
  return StatementBank.UNKNOWN;
}

function detectStatementYear(text: string): number {
  // Looks for a 4-digit year near common Indonesian period labels
  // (e.g. "PERIODE : AGUSTUS 2026"), falling back to the current year.
  const periodeMatch = text.match(/PERIODE\s*:?\s*[A-Za-z]*\s*(\d{4})/i);
  if (periodeMatch) return Number(periodeMatch[1]);
  const anyYearMatch = text.match(/\b(20\d{2})\b/);
  if (anyYearMatch) return Number(anyYearMatch[1]);
  return new Date().getFullYear();
}

/**
 * Block-based parser for BCA e-statement text (validated against a real
 * "REKENING TAHAPAN XPRESI" export, including its "POKET" sub-accounts).
 *
 * pdf-parse flattens the PDF's transaction table into plain lines with no
 * column structure, and each real transaction spans several lines rather
 * than one:
 *
 *   16/08 TRANSAKSI DEBIT TGL: 16/08      <- block start: date + description
 *   QR 915                                <- description continued
 *   00000.00MissCuan                      <- description continued
 *   17,000.00 DB 493,476.89               <- formatted amount [+ DB] [+ balance]
 *
 * or, for a credit with a marker embedded in the description instead of the
 * amount line:
 *
 *   17/08 TRSF E-BANKING CR 1708/FTSCY/WS95031   <- block start (has "CR")
 *   16000.00                                     <- bare amount line
 *   SABRINA CITRA RAMA                           <- description continued
 *   16,000.00 482,476.89                         <- formatted amount, no DB
 *
 * Algorithm: split the text into blocks at each "DD/MM ..." start line
 * (skipping boilerplate/header/footer lines and admin-only blocks like
 * "SALDO AWAL"/"SALDO AKHIR"/"MUTASI ..." totals), then within each block:
 *   - amount: prefer the last formatted amount line's value; fall back to
 *     the first bare amount line if no formatted line is present.
 *   - direction: a standalone "DB" anywhere in the block means debit; a
 *     standalone "CR" (typically in the date line, e.g. "TRSF E-BANKING CR")
 *     means credit; if the block has neither marker (e.g. "BUNGA POKET"
 *     interest), it's treated as a credit since the observed unmarked cases
 *     were incoming amounts.
 */
export function parseStatementText(text: string): { bank: StatementBank; transactions: ParsedTransaction[] } {
  const bank = detectBank(text);
  const yearHint = detectStatementYear(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0 && !isBoilerplate(line));

  const transactions: ParsedTransaction[] = [];

  let currentBlock: { day: number; month: number; descriptionLines: string[] } | null = null;

  const flushBlock = () => {
    if (!currentBlock) return;
    const block = currentBlock;
    currentBlock = null;

    const firstLine = block.descriptionLines[0] || '';
    if (/^SALDO AWAL\b/i.test(firstLine) || /^TRANSAKSI TIDAK TERSEDIA/i.test(firstLine)) {
      // Opening balance / "no transactions" placeholder, not a real movement.
      return;
    }

    let formattedAmount: number | null = null;
    let hasFormattedDB = false;
    let bareAmount: number | null = null;
    let hasStandaloneCR = false;
    let hasStandaloneDB = false;

    for (const line of block.descriptionLines) {
      const formattedMatch = line.match(FORMATTED_AMOUNT_LINE);
      if (formattedMatch) {
        formattedAmount = parseFormattedAmount(formattedMatch[1]);
        hasFormattedDB = Boolean(formattedMatch[2]);
        continue;
      }
      if (bareAmount === null && BARE_AMOUNT_LINE.test(line)) {
        bareAmount = parseBareAmount(line);
      }
      if (/\bDB\b/.test(line) || /\bDR\b/.test(line)) hasStandaloneDB = true;
      if (/\bCR\b/.test(line)) hasStandaloneCR = true;
    }

    const amount = formattedAmount ?? bareAmount ?? 0;
    if (amount <= 0) return;

    // Direction priority: the formatted amount line's own "DB" suffix is the
    // most reliable signal (present only for debits in the observed data).
    // Otherwise fall back to any standalone DB/DR or CR token in the block.
    const type: 'CR' | 'DB' = hasFormattedDB || (!hasStandaloneCR && hasStandaloneDB) ? 'DB' : 'CR';

    const date = parseDate(block.day, block.month, yearHint);
    if (!date) return;

    const description = firstLine.replace(/^\d{1,2}\/\d{1,2}\s+/, '').trim().slice(0, 500) || 'Unlabeled transaction';

    transactions.push({ date, description, amount, type });
  };

  for (const line of lines) {
    if (SUMMARY_LINE_PATTERN.test(line)) {
      flushBlock();
      continue;
    }

    const startMatch = line.match(BLOCK_START_PATTERN);
    if (startMatch) {
      flushBlock();
      currentBlock = {
        day: Number(startMatch[1]),
        month: Number(startMatch[2]),
        descriptionLines: [line],
      };
      continue;
    }

    if (currentBlock) {
      currentBlock.descriptionLines.push(line);
    }
  }
  flushBlock();

  return { bank, transactions };
}

function monthsBetween(start: Date, end: Date): number {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

function toSummary(
  upload: {
    id: string;
    fileName: string;
    status: StatementUploadStatus;
    errorMessage: string | null;
    bank: StatementBank;
    periodStart: Date | null;
    periodEnd: Date | null;
    transactionCount: number;
    monthlyAvgRevenue: Prisma.Decimal | null;
    monthlyAvgExpense: Prisma.Decimal | null;
    totalMonths: number;
    createdAt: Date;
  },
  topExpenseCategories: ExpenseCategoryBreakdown[]
): StatementSummary {
  return {
    id: upload.id,
    fileName: upload.fileName,
    status: upload.status,
    errorMessage: upload.errorMessage,
    bank: upload.bank,
    periodStart: upload.periodStart,
    periodEnd: upload.periodEnd,
    transactionCount: upload.transactionCount,
    monthlyAvgRevenue: upload.monthlyAvgRevenue === null ? null : Number(upload.monthlyAvgRevenue),
    monthlyAvgExpense: upload.monthlyAvgExpense === null ? null : Number(upload.monthlyAvgExpense),
    totalMonths: upload.totalMonths,
    createdAt: upload.createdAt,
    topExpenseCategories,
  };
}

export class StatementService {
  /**
   * Extracts raw text from a PDF buffer, parses transaction lines, computes
   * monthly average revenue/expense, and persists both the transaction rows
   * (feeding the existing prediction engine via the `Transaction` table) and
   * a `StatementUpload` log row.
   *
   * A `StatementUpload` row is created (status PROCESSING) and the original
   * PDF is uploaded to private storage BEFORE any parsing happens, so every
   * upload attempt — including ones that fail to parse — leaves a durable
   * record with the original file attached. On failure the same row is
   * updated to FAILED with a human-readable `errorMessage` (and a
   * `rawTextPreview` if text extraction itself succeeded), then the
   * original error is re-thrown so the controller's existing 4xx behavior
   * is unchanged.
   */
  static async processPdf(userId: string, fileBuffer: Buffer, fileName: string): Promise<StatementSummary> {
    const filePath = await StorageService.uploadStatementFile(userId, {
      buffer: fileBuffer,
      mimetype: 'application/pdf',
      originalname: fileName,
    });

    const upload = await prisma.statementUpload.create({
      data: {
        userId,
        fileName,
        filePath,
        status: StatementUploadStatus.PROCESSING,
      },
    });

    try {
      const summary = await this.parseAndPersist(userId, upload.id, fileBuffer);
      return summary;
    } catch (error) {
      const errorMessage = error instanceof ApiError ? error.message : 'Failed to process the uploaded statement.';
      await prisma.statementUpload.update({
        where: { id: upload.id },
        data: { status: StatementUploadStatus.FAILED, errorMessage },
      });
      throw error;
    }
  }

  /**
   * Runs the actual PDF text extraction + parsing + computation, and on
   * success updates the given `StatementUpload` row to SUCCESS. Throws
   * (without updating the row itself — the caller handles marking it
   * FAILED) on any parse failure, so `rawTextPreview` can still be attached
   * here even when zero transactions are found.
   */
  private static async parseAndPersist(
    userId: string,
    uploadId: string,
    fileBuffer: Buffer
  ): Promise<StatementSummary> {
    // Lazy-loaded: pdf-parse pulls in canvas/DOMMatrix-related machinery at
    // module load time, which crashes serverless cold starts on platforms
    // (e.g. Vercel) missing the optional @napi-rs/canvas native binary.
    // Deferring the require until a statement is actually uploaded keeps
    // every other route (including login) unaffected by that dependency.
    //
    // We also pass pdf-parse's own CanvasFactory explicitly (its documented
    // fix for "DOMMatrix is not defined" on serverless platforms), so text
    // extraction itself doesn't need a native canvas binary at all:
    // https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/troubleshooting.md
    const { CanvasFactory } = await import('pdf-parse/worker');
    const { PDFParse } = await import('pdf-parse');

    let text: string;
    const parser = new PDFParse({ data: fileBuffer, CanvasFactory });
    try {
      const result = await parser.getText();
      text = result.text || '';
    } catch (error) {
      throw ApiError.badRequest('The uploaded file could not be read as a valid PDF.');
    } finally {
      await parser.destroy();
    }

    if (!text.trim()) {
      throw ApiError.badRequest('The PDF appears to be empty or is a scanned image without extractable text.');
    }

    const rawTextPreview = text.slice(0, RAW_TEXT_PREVIEW_LENGTH);

    const { bank, transactions } = parseStatementText(text);
    if (transactions.length === 0) {
      // Text extraction succeeded but nothing matched — persist the preview
      // on the row now (rather than only on the generic catch in
      // processPdf) so it's available for debugging even though this same
      // error also gets caught and turned into a FAILED status upstream.
      await prisma.statementUpload.update({
        where: { id: uploadId },
        data: { bank, rawTextPreview },
      });
      throw ApiError.badRequest(
        'No transactions could be recognized in this statement. Supported formats: BCA, Mandiri, BRI text-based PDF exports.'
      );
    }

    const dates = transactions.map((transaction) => transaction.date.getTime());
    const periodStart = new Date(Math.min(...dates));
    const periodEnd = new Date(Math.max(...dates));
    const totalMonths = monthsBetween(periodStart, periodEnd);

    const totalRevenue = transactions
      .filter((transaction) => transaction.type === 'CR')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalExpense = transactions
      .filter((transaction) => transaction.type === 'DB')
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const monthlyAvgRevenue = totalRevenue / totalMonths;
    const monthlyAvgExpense = totalExpense / totalMonths;
    const topExpenseCategories = summarizeExpenseCategories(transactions, totalExpense);

    const updatedUpload = await prisma.$transaction(async (tx) => {
      const updated = await tx.statementUpload.update({
        where: { id: uploadId },
        data: {
          status: StatementUploadStatus.SUCCESS,
          errorMessage: null,
          bank,
          periodStart,
          periodEnd,
          transactionCount: transactions.length,
          monthlyAvgRevenue,
          monthlyAvgExpense,
          totalMonths,
          rawTextPreview,
        },
      });

      await tx.transaction.createMany({
        data: transactions.map((transaction) => ({
          userId,
          amount: new Prisma.Decimal(transaction.amount),
          type: transaction.type === 'CR' ? TransactionType.REVENUE : TransactionType.EXPENSE,
          category: categorize(transaction.description),
          description: transaction.description,
          occurredAt: transaction.date,
          source: 'STATEMENT_UPLOAD',
          statementUploadId: updated.id,
        })),
      });

      return updated;
    });

    return toSummary(updatedUpload, topExpenseCategories);
  }

  static async getLatest(userId: string): Promise<StatementSummary | null> {
    const upload = await prisma.statementUpload.findFirst({
      where: { userId, status: StatementUploadStatus.SUCCESS },
      orderBy: { createdAt: 'desc' },
    });
    if (!upload) return null;
    return this.buildSummaryWithCategories(upload);
  }

  /**
   * Paginated upload history for the current user, newest first. Deliberately
   * omits `filePath` — the list view must never expose the storage object
   * path or a signed URL; use `getFileSignedUrl` for that, scoped per item.
   */
  static async list(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [uploads, total] = await Promise.all([
      prisma.statementUpload.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.statementUpload.count({ where: { userId } }),
    ]);

    return {
      items: uploads.map((upload) => ({
        id: upload.id,
        fileName: upload.fileName,
        status: upload.status,
        errorMessage: upload.errorMessage,
        bank: upload.bank,
        createdAt: upload.createdAt,
        transactionCount: upload.transactionCount,
        monthlyAvgRevenue: upload.monthlyAvgRevenue === null ? null : Number(upload.monthlyAvgRevenue),
        monthlyAvgExpense: upload.monthlyAvgExpense === null ? null : Number(upload.monthlyAvgExpense),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Single upload detail, scoped to the given userId. Returns null if the
   * upload doesn't exist or doesn't belong to this user (the controller is
   * responsible for turning that into a 404).
   */
  static async getById(userId: string, id: string): Promise<StatementSummary | null> {
    const upload = await prisma.statementUpload.findFirst({ where: { id, userId } });
    if (!upload) return null;
    return this.buildSummaryWithCategories(upload);
  }

  /**
   * Returns the raw `StatementUpload` row (including `filePath`) for
   * ownership checks + signed URL generation. Never exposed directly to the
   * client — see `StatementController.file`.
   */
  static async getOwnedUploadOrThrow(userId: string, id: string) {
    const upload = await prisma.statementUpload.findUnique({ where: { id } });
    if (!upload) throw ApiError.notFound('Statement upload not found');
    if (upload.userId !== userId) throw ApiError.forbidden('You do not have access to this statement upload');
    if (!upload.filePath) throw ApiError.notFound('No file is stored for this statement upload');
    return upload;
  }

  static async getFileSignedUrl(userId: string, id: string): Promise<string> {
    const upload = await this.getOwnedUploadOrThrow(userId, id);
    return StorageService.getStatementFileSignedUrl(upload.filePath as string);
  }

  private static async buildSummaryWithCategories(upload: {
    id: string;
    fileName: string;
    status: StatementUploadStatus;
    errorMessage: string | null;
    bank: StatementBank;
    periodStart: Date | null;
    periodEnd: Date | null;
    transactionCount: number;
    monthlyAvgRevenue: Prisma.Decimal | null;
    monthlyAvgExpense: Prisma.Decimal | null;
    totalMonths: number;
    createdAt: Date;
  }): Promise<StatementSummary> {
    const expenseTransactions = await prisma.transaction.findMany({
      where: { statementUploadId: upload.id, type: TransactionType.EXPENSE },
      select: { amount: true, category: true },
    });
    const totalExpense = expenseTransactions.reduce((sum, item) => sum + Number(item.amount), 0);
    const topExpenseCategories = summarizeCategorizedAmounts(
      expenseTransactions.map((item) => ({ category: item.category || 'Other', amount: Number(item.amount) })),
      totalExpense
    );

    return toSummary(upload, topExpenseCategories);
  }
}

function summarizeExpenseCategories(
  transactions: ParsedTransaction[],
  totalExpense: number
): ExpenseCategoryBreakdown[] {
  const categorized = transactions
    .filter((transaction) => transaction.type === 'DB')
    .map((transaction) => ({ category: categorize(transaction.description), amount: transaction.amount }));
  return summarizeCategorizedAmounts(categorized, totalExpense);
}

function summarizeCategorizedAmounts(
  entries: Array<{ category: string; amount: number }>,
  totalExpense: number
): ExpenseCategoryBreakdown[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.category, (totals.get(entry.category) || 0) + entry.amount);
  }

  return Array.from(totals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

// Very small keyword-based categorizer for the "Top Expense Categories"
// breakdown. Falls back to "Other" when nothing matches.
const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: 'Payroll & Operations', keywords: ['gaji', 'payroll', 'salary', 'thr'] },
  { category: 'Marketing & Ads', keywords: ['ads', 'marketing', 'iklan', 'promo'] },
  { category: 'Software & Utilities', keywords: ['subscription', 'software', 'listrik', 'internet', 'utility', 'utilities'] },
  { category: 'Vendor & Supplies', keywords: ['vendor', 'supplier', 'purchase', 'pembelian'] },
  { category: 'Transfer', keywords: ['transfer', 'trf'] },
];

function categorize(description: string): string {
  const lower = description.toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) {
      return entry.category;
    }
  }
  return 'Other';
}
