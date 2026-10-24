import { generateAndEmailAllMonthlyStatements } from "../services/statementService.js";

/**
 * Starts the monthly bank statement cron job.
 * Runs on the 1st of every month at 00:00 (Midnight).
 *
 * Cron expression: "0 0 1 * *"
 * (0th minute, 0th hour, 1st day of every month, every month, any day of week)
 */
export function startMonthlyStatementJob() {
  const cronExpression = process.env.MONTHLY_STATEMENT_CRON || "0 0 1 * *";

  try {
    import("node-cron")
      .then((cron) => {
        cron.default.schedule(cronExpression, async () => {
          console.log(`[monthlyStatementJob] Triggered on schedule: ${new Date().toISOString()}`);
          try {
            const summary = await generateAndEmailAllMonthlyStatements();
//             const summary = await generateAndEmailAllMonthlyStatements({
//   userId: process.env.MONTHLY_STATEMENT_TEST_USER_ID,
//   sendEmail: true,
//   force: true,
// });
            console.log(
              `[monthlyStatementJob] Completed statement generation for ${summary.monthName}: ` +
                `Eligible=${summary.totalEligible}, Sent=${summary.sentCount}, Skipped=${summary.skippedCount}, Failed=${summary.failedCount}`
            );
          } catch (err) {
            console.error("[monthlyStatementJob] Fatal error in monthly statement generation:", err);
          }
        });
        console.log(`Monthly bank statement job scheduled with node-cron ('${cronExpression}' - 1st of every month at midnight).`);
      })
      .catch((importErr) => {
        console.warn("[monthlyStatementJob] node-cron import failed, using daily check fallback:", importErr.message);

        // Fallback: Check once every 24 hours if today is the 1st of the month
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        setInterval(async () => {
          const now = new Date();
          if (now.getDate() === 1) {
            try {
              console.log("[monthlyStatementJob-fallback] Today is the 1st of the month. Executing statement job...");
              await generateAndEmailAllMonthlyStatements();
            } catch (err) {
              console.error("[monthlyStatementJob-fallback] error:", err.message);
            }
          }
        }, TWENTY_FOUR_HOURS);
        console.log("Monthly bank statement job scheduled with setInterval fallback (daily check).");
      });
  } catch (err) {
    console.error("Failed to start monthly bank statement job:", err);
  }
}

export default { startMonthlyStatementJob };
