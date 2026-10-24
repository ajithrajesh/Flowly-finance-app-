
import { calculateEMI, compareEmiOptions, round2 } from "../utils/emiCalculator.js";

export const calculateLoanEMI = (req, res) => {
  try {
    const { amount, interestRate = 12, tenureMonths, tenureYears, interestType = "diminishing" } = req.body;

    const principal = Number(amount);
    const rateAnnual = Number(interestRate);
    const months = tenureMonths
      ? Number(tenureMonths)
      : tenureYears
      ? Number(tenureYears) * 12
      : 12;

    if (!principal || principal <= 0 || months <= 0) {
      return res.status(400).json({
        message: "Please provide valid loan amount and tenure",
      });
    }

    const type = (interestType || "diminishing").toLowerCase();
    const comparison = compareEmiOptions(principal, rateAnnual, months);

    const activeCalc = type === "flat" ? comparison.flat : comparison.diminishing;

    return res.status(200).json({
      calculation: {
        principalAmount: round2(principal),
        annualInterestRate: rateAnnual,
        tenureMonths: months,
        interestType: type === "flat" ? "flat" : "diminishing",
        monthlyEMI: activeCalc.monthlyEMI,
        totalInterest: activeCalc.totalInterest,
        totalPayable: activeCalc.totalRepayment,
        // Side-by-side comparison for both modes
        diminishing: comparison.diminishing,
        flat: comparison.flat,
        savingsWithDiminishing: comparison.savingsWithDiminishing,
        monthlyDifference: comparison.monthlyDifference,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Loan calculation failed",
      error: error.message,
    });
  }
};


export const calculateFD = (req, res) => {
  try {
    const { principalAmount, interestRate = 7.5, tenureMonths } = req.body;

    const P = Number(principalAmount);
    const r = Number(interestRate);
    const n = Number(tenureMonths);

    if (!P || P <= 0 || !n || n <= 0) {
      return res.status(400).json({
        message: "Please provide valid principal amount and tenure in months",
      });
    }

    // Quarterly Compounding: A = P * (1 + r/400)^(4 * t_years)
    const tYears = n / 12;
    const maturityAmount = P * Math.pow(1 + r / 400, 4 * tYears);
    const totalInterestEarned = maturityAmount - P;

    return res.status(200).json({
      calculation: {
        principalAmount: Math.round(P * 100) / 100,
        annualInterestRate: r,
        tenureMonths: n,
        totalInterestEarned: Math.round(totalInterestEarned * 100) / 100,
        maturityAmount: Math.round(maturityAmount * 100) / 100,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "FD calculation failed",
      error: error.message,
    });
  }
};
