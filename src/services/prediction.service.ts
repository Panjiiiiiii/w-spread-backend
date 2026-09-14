import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000;
const RISK_MARGIN = 0.95;

type PredictionInput = {
  timeframeMonths: number;
  payrollImpact: number;
  vendorImpact: number;
};

const toNumber = (value: Prisma.Decimal | number | string) => Number(value);

function riskLevel(balance: number, monthlyBurn: number) {
  if (balance <= 0) return 'HIGH';
  if (monthlyBurn <= 0) return 'LOW';
  const runwayMonths = balance / monthlyBurn;
  return runwayMonths < 3 ? 'HIGH' : runwayMonths < 6 ? 'MEDIUM' : 'LOW';
}

export class PredictionService {
  static async create(userId: string, input: PredictionInput) {
    const since = new Date(Date.now() - 12 * MONTH_MS);
    const transactions = await prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: since } },
      orderBy: { occurredAt: 'asc' },
    });

    const revenue = transactions
      .filter((transaction) => transaction.type === 'REVENUE')
      .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
    const expenses = transactions
      .filter((transaction) => transaction.type === 'EXPENSE')
      .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
    const currentBalance = revenue - expenses;
    const averageMonthlyRevenue = revenue / 12;
    const averageMonthlyExpenses = expenses / 12;
    const monthlyNet = averageMonthlyRevenue
      - averageMonthlyExpenses
      - input.payrollImpact
      - input.vendorImpact;
    const predictedBalance = currentBalance + input.timeframeMonths * monthlyNet;
    const conservativeBalance = currentBalance
      + input.timeframeMonths * (
        averageMonthlyRevenue * RISK_MARGIN
        - averageMonthlyExpenses
        - input.payrollImpact
        - input.vendorImpact
      );
    const risk = riskLevel(
      conservativeBalance,
      Math.max(0, averageMonthlyExpenses + input.payrollImpact + input.vendorImpact - averageMonthlyRevenue),
    );

    const prediction = await prisma.prediction.create({
      data: {
        userId,
        currentBalance,
        predictedBalance,
        conservativeBalance,
        timeframeMonths: input.timeframeMonths,
        averageMonthlyRevenue,
        averageMonthlyExpenses,
        payrollImpact: input.payrollImpact,
        vendorImpact: input.vendorImpact,
        riskLevel: risk,
      },
    });

    return {
      id: prediction.id,
      currentBalance,
      predictedBalance,
      conservativeBalance,
      timeframeMonths: prediction.timeframeMonths,
      averageMonthlyRevenue,
      averageMonthlyExpenses,
      payrollImpact: input.payrollImpact,
      vendorImpact: input.vendorImpact,
      riskLevel: risk,
      createdAt: prediction.createdAt,
    };
  }

  static async list(userId: string) {
    const predictions = await prisma.prediction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return predictions.map((prediction) => ({
      ...prediction,
      currentBalance: toNumber(prediction.currentBalance),
      predictedBalance: toNumber(prediction.predictedBalance),
      conservativeBalance: toNumber(prediction.conservativeBalance),
      averageMonthlyRevenue: toNumber(prediction.averageMonthlyRevenue),
      averageMonthlyExpenses: toNumber(prediction.averageMonthlyExpenses),
      payrollImpact: toNumber(prediction.payrollImpact),
      vendorImpact: toNumber(prediction.vendorImpact),
    }));
  }
}
