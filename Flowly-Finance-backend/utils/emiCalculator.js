export function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calculateEMI(principal, annualRatePercent, tenureMonths, interestType = "diminishing") {
  if (principal <= 0 || tenureMonths <= 0) {
    throw new Error("principal and tenureMonths must be positive");
  }

  const type = (interestType || "diminishing").toLowerCase();

  if (type === "flat") {
    const totalInterest = (principal * (annualRatePercent / 100) * tenureMonths) / 12;
    const totalRepayment = principal + totalInterest;
    return round2(totalRepayment / tenureMonths);
  }

  // Diminishing / Reducing Balance Rate
  const r = annualRatePercent / 12 / 100;
  if (r === 0) {
    return round2(principal / tenureMonths);
  }

  const factor = Math.pow(1 + r, tenureMonths);
  const emi = (principal * r * factor) / (factor - 1);
  return round2(emi);
}

export function generateSchedule({ principal, annualRatePercent, tenureMonths, startDate, interestType = "diminishing" }) {
  const type = (interestType || "diminishing").toLowerCase();
  const schedule = [];
  let dueDate = new Date(startDate);

  if (type === "flat") {
    const totalInterest = round2((principal * (annualRatePercent / 100) * tenureMonths) / 12);
    const totalRepayment = round2(principal + totalInterest);
    const regularEmi = round2(totalRepayment / tenureMonths);
    const regularPrincipal = round2(principal / tenureMonths);
    const regularInterest = round2(totalInterest / tenureMonths);

    let balance = principal;
    let accumulatedInterest = 0;

    for (let i = 1; i <= tenureMonths; i++) {
      dueDate = addMonths(dueDate, 1);

      let principalComponent = regularPrincipal;
      let interestComponent = regularInterest;
      let installmentAmount = regularEmi;

      if (i === tenureMonths) {
        // Last installment balances exact remainder
        principalComponent = balance;
        interestComponent = round2(totalInterest - accumulatedInterest);
        installmentAmount = round2(principalComponent + interestComponent);
      }

      balance = round2(balance - principalComponent);
      accumulatedInterest = round2(accumulatedInterest + interestComponent);

      schedule.push({
        installmentNo: i,
        dueDate,
        emiAmount: installmentAmount,
        principalComponent,
        interestComponent,
        outstandingBalance: Math.max(balance, 0),
        status: "Pending",
        paidAmount: 0,
        paidDate: null,
        lateFee: 0,
        gateway: undefined,
      });
    }

    return {
      emi: regularEmi,
      totalInterest,
      totalRepayment,
      interestType: "flat",
      schedule,
    };
  }

  // Diminishing / Reducing Balance Rate
  const emi = calculateEMI(principal, annualRatePercent, tenureMonths, "diminishing");
  const r = annualRatePercent / 12 / 100;

  let balance = principal;
  let totalInterest = 0;
  let accumulatedPrincipal = 0;

  for (let i = 1; i <= tenureMonths; i++) {
    dueDate = addMonths(dueDate, 1);

    const interestComponent = round2(balance * r);
    let principalComponent = round2(emi - interestComponent);
    let installmentAmount = emi;

    if (i === tenureMonths) {
      principalComponent = balance;
      installmentAmount = round2(principalComponent + interestComponent);
    }

    balance = round2(balance - principalComponent);
    accumulatedPrincipal = round2(accumulatedPrincipal + principalComponent);
    totalInterest = round2(totalInterest + interestComponent);

    schedule.push({
      installmentNo: i,
      dueDate,
      emiAmount: installmentAmount,
      principalComponent,
      interestComponent,
      outstandingBalance: Math.max(balance, 0),
      status: "Pending",
      paidAmount: 0,
      paidDate: null,
      lateFee: 0,
      gateway: undefined,
    });
  }

  return {
    emi,
    totalInterest,
    totalRepayment: round2(principal + totalInterest),
    interestType: "diminishing",
    schedule,
  };
}

/**
 * Compare Flat Rate vs Diminishing Balance EMI side-by-side
 */
export function compareEmiOptions(principal, annualRatePercent, tenureMonths) {
  const p = Number(principal);
  const rate = Number(annualRatePercent);
  const months = Number(tenureMonths);

  // Diminishing
  const dimEMI = calculateEMI(p, rate, months, "diminishing");
  const dimTotalRepayment = round2(dimEMI * months);
  const dimTotalInterest = round2(dimTotalRepayment - p);

  // Flat
  const flatEMI = calculateEMI(p, rate, months, "flat");
  const flatTotalInterest = round2((p * (rate / 100) * months) / 12);
  const flatTotalRepayment = round2(p + flatTotalInterest);

  return {
    principal: p,
    annualRatePercent: rate,
    tenureMonths: months,
    diminishing: {
      monthlyEMI: dimEMI,
      totalInterest: dimTotalInterest,
      totalRepayment: dimTotalRepayment,
    },
    flat: {
      monthlyEMI: flatEMI,
      totalInterest: flatTotalInterest,
      totalRepayment: flatTotalRepayment,
    },
    savingsWithDiminishing: round2(flatTotalInterest - dimTotalInterest),
    monthlyDifference: round2(flatEMI - dimEMI),
  };
}

/**
 * Standard EMI late payment penalty calculation when due date is exceeded
 * - Minimum base penalty of ₹500 or 2% of EMI amount
 * - Incremental daily late fee of ₹25/day beyond a 3-day grace period (up to ₹2,500 max)
 */
export function calculateLateFeePenalty({ emiAmount, dueDate, asOfDate = new Date() }) {
  const due = new Date(dueDate);
  const now = new Date(asOfDate);

  // Normalize to compare dates at end of day
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
  if (now <= dueDay) {
    return {
      isOverdue: false,
      daysOverdue: 0,
      lateFee: 0,
      basePenalty: 0,
      dailyFee: 0,
    };
  }

  const diffMs = now.getTime() - dueDay.getTime();
  const daysOverdue = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // Base penalty: ₹500 or 2% of installment amount, whichever is higher
  const basePenalty = Math.max(500, round2(Number(emiAmount || 0) * 0.02));

  // Daily late fee beyond 3-day grace period
  const graceDays = 3;
  const daysBeyondGrace = Math.max(0, daysOverdue - graceDays);
  const dailyFee = Math.min(daysBeyondGrace * 25, 2500);

  const lateFee = round2(basePenalty + dailyFee);

  return {
    isOverdue: true,
    daysOverdue,
    lateFee,
    basePenalty,
    dailyFee,
  };
}

