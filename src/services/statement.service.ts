import { PDFParse } from 'pdf-parse';
import { Prisma, StatementBank, TransactionType } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';

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
  bank: StatementBank;
  periodStart: Date | null;
  periodEnd: Date | null;
  transactionCount: number;
  monthlyAvgRevenue: number;
  monthlyAvgExpense: number;
  totalMonths: number;
  createdAt: Date;
  topExpenseCategories: ExpenseCategoryBreakdown[];
}

const MONTH_NAMES_ID: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, agu: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11,
};

// Matches amounts formatted with Indonesian thousands separator (.) and
// optional decimal comma, e.g. "1.250.000,00" or "1.250.000".
const AMOUNT_PATTERN = /\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/;

/**
 * Line-based heuristic parser for BCA / Mandiri / BRI e-statement text.
 * pdf-parse only returns flattened text (no true table/column structure),
 * so bank statement rows are recovered from consistent per-line patterns:
 * a leading date, a trailing amount, and a trailing CR/DB (or DB/CR-style)
 * mutation indicator. This covers the common single-line-per-transaction
 * layout used by BCA, Mandiri, and BRI text-based (non-scanned) statements.
 *
 * NOTE: this has not been validated against real bank statement samples in
 * this environment. If parsing accuracy needs improvement for a specific
 * bank's actual layout, tune BANK_LINE_PATTERNS below against real exports.
 */
const BANK_LINE_PATTERNS: Array<{ bank: StatementBank; pattern: RegExp }> = [
  // BCA mutation line: "01/02  TRANSFER MASUK  1.500.000,00  CR"
  {
    bank: StatementBank.BCA,
    pattern: new RegExp(
      `^(\\d{2}/\\d{2})\\s+(.+?)\\s+(${AMOUNT_PATTERN.source})\\s*(CR|DB)$`,
      'i'
    ),
  },
  // Mandiri mutation line: "01/02/2026  TRANSFER MASUK  1.500.000,00  CR"
  {
    bank: StatementBank.MANDIRI,
    pattern: new RegExp(
      `^(\\d{2}/\\d{2}/\\d{2,4})\\s+(.+?)\\s+(${AMOUNT_PATTERN.source})\\s*(CR|DB)$`,
      'i'
    ),
  },
  // BRI mutation line: "01-02-2026  TRANSFER MASUK  1.500.000,00  K" (K=Kredit/CR, D=Debit/DB)
  {
    bank: StatementBank.BRI,
    pattern: new RegExp(
      `^(\\d{2}-\\d{2}-\\d{2,4})\\s+(.+?)\\s+(${AMOUNT_PATTERN.source})\\s*(K|D)$`,
      'i'
    ),
  },
];

// Generic fallback: any line with a leading date-like token, a trailing
// amount, and an explicit CR/DB/K/D marker, regardless of separator style.
const GENERIC_LINE_PATTERN = new RegExp(
  `^(\\d{1,2}[\\/-]\\d{1,2}(?:[\\/-]\\d{2,4})?)\\s+(.+?)\\s+(${AMOUNT_PATTERN.source})\\s*(CR|DB|K|D)$`,
  'i'
);

function parseAmount(raw: string): number {
  // "1.250.000,50" -> 1250000.50 ; "1.250.000" -> 1250000
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parseDate(raw: string, statementYearHint: number): Date | null {
  const parts = raw.split(/[\/-]/).map((part) => part.trim());
  if (parts.length < 2) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  let year = parts.length >= 3 ? Number(parts[2]) : statementYearHint;
  if (year < 100) year += 2000;
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
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
  // (e.g. "PERIODE : MEI 2026"), falling back to the current year.
  const periodeMatch = text.match(/PERIODE\s*:?\s*[A-Za-z]*\s*(\d{4})/i);
  if (periodeMatch) return Number(periodeMatch[1]);
  const anyYearMatch = text.match(/\b(20\d{2})\b/);
  if (anyYearMatch) return Number(anyYearMatch[1]);
  return new Date().getFullYear();
}

/**
 * Extracts an array of transaction records from raw bank statement text.
 * Tries bank-specific line patterns first (based on the detected bank),
 * falling back to a generic date+amount+CR/DB pattern for any unmatched
 * lines or unrecognized banks.
 */
export function parseStatementText(text: string): { bank: StatementBank; transactions: ParsedTransaction[] } {
  const bank = detectBank(text);
  const yearHint = detectStatementYear(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const specificPattern = BANK_LINE_PATTERNS.find((entry) => entry.bank === bank)?.pattern;
  const transactions: ParsedTransaction[] = [];

  for (const line of lines) {
    const match = (specificPattern && line.match(specificPattern)) || line.match(GENERIC_LINE_PATTERN);
    if (!match) continue;

    const [, rawDate, rawDescription, rawAmount, rawMarker] = match;
    const date = parseDate(rawDate, yearHint);
    const amount = parseAmount(rawAmount);
    if (!date || amount <= 0) continue;

    const marker = rawMarker.toUpperCase();
    const type: 'CR' | 'DB' = marker === 'CR' || marker === 'K' ? 'CR' : 'DB';

    transactions.push({
      date,
      description: rawDescription.trim().slice(0, 500) || 'Unlabeled transaction',
      amount,
      type,
    });
  }

  return { bank, transactions };
}

function monthsBetween(start: Date, end: Date): number {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

export class StatementService {
  /**
   * Extracts raw text from a PDF buffer, parses transaction lines, computes
   * monthly average revenue/expense, and persists both the transaction rows
   * (feeding the existing prediction engine via the `Transaction` table) and
   * a `StatementUpload` summary row.
   */
  static async processPdf(userId: string, fileBuffer: Buffer, fileName: string): Promise<StatementSummary> {
    let text: string;
    const parser = new PDFParse({ data: fileBuffer });
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

    const { bank, transactions } = parseStatementText(text);
    if (transactions.length === 0) {
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

    const summary = await prisma.$transaction(async (tx) => {
      const upload = await tx.statementUpload.create({
        data: {
          userId,
          fileName,
          bank,
          periodStart,
          periodEnd,
          transactionCount: transactions.length,
          monthlyAvgRevenue,
          monthlyAvgExpense,
          totalMonths,
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
          statementUploadId: upload.id,
        })),
      });

      return upload;
    });

    return {
      id: summary.id,
      fileName: summary.fileName,
      bank: summary.bank,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      transactionCount: summary.transactionCount,
      monthlyAvgRevenue,
      monthlyAvgExpense,
      totalMonths: summary.totalMonths,
      createdAt: summary.createdAt,
      topExpenseCategories,
    };
  }

  static async getLatest(userId: string): Promise<StatementSummary | null> {
    const upload = await prisma.statementUpload.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!upload) return null;

    const expenseTransactions = await prisma.transaction.findMany({
      where: { statementUploadId: upload.id, type: TransactionType.EXPENSE },
      select: { amount: true, category: true },
    });
    const totalExpense = expenseTransactions.reduce((sum, item) => sum + Number(item.amount), 0);
    const topExpenseCategories = summarizeCategorizedAmounts(
      expenseTransactions.map((item) => ({ category: item.category || 'Other', amount: Number(item.amount) })),
      totalExpense
    );

    return {
      id: upload.id,
      fileName: upload.fileName,
      bank: upload.bank,
      periodStart: upload.periodStart,
      periodEnd: upload.periodEnd,
      transactionCount: upload.transactionCount,
      monthlyAvgRevenue: Number(upload.monthlyAvgRevenue),
      monthlyAvgExpense: Number(upload.monthlyAvgExpense),
      totalMonths: upload.totalMonths,
      createdAt: upload.createdAt,
      topExpenseCategories,
    };
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
