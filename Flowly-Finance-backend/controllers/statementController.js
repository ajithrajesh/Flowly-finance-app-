import Account from "../models/Account.js";
import MonthlyStatement from "../models/MonthlyStatement.js";
import {
  getPreviousMonthRange,
  getMonthRangeFromPeriodKey,
  getAllTimeRange,
  compileStatementData,
  processAccountMonthlyStatement,
  generateAndEmailAllMonthlyStatements,
} from "../services/statementService.js";
import { generateStatementPDF } from "../utils/statementPdfGenerator.js";
import { successResponse, errorResponse } from "../utils/responseUtil.js";

class StatementController {
  /**
   * Get list of past monthly statements for the authenticated user.
   */
  async getMyStatements(req, res) {
    try {
      const userId = req.user._id || req.user.id;

      // Find user's accounts
      const accounts = await Account.find({ user: userId }).select("_id accountNumber accountType");
      const accountIds = accounts.map((a) => a._id);

      const statements = await MonthlyStatement.find({ account: { $in: accountIds } })
        .sort({ periodKey: -1, createdAt: -1 })
        .lean();

      return successResponse(res, {
        data: {
          accounts,
          statements,
        },
        message: "Customer monthly statements fetched successfully",
      });
    } catch (err) {
      console.error("StatementController getMyStatements error:", err);
      return errorResponse(res, err.message, 500);
    }
  }

  /**
   * Download a statement as PDF for a specific account and period.
   * Query params: ?period=YYYY-MM&accountId=...&all=true
   * Defaults to downloading all existing transactions if no period is passed or all=true.
   */
  async downloadStatement(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const userRole = req.user.role || "customer";
      const { period, accountId, all } = req.query;

      // If all=true, or period='all', or no period specified, resolve to all-time range
      const isAll = all === "true" || period === "all" || !period;
      const periodRange = isAll
        ? getAllTimeRange()
        : getMonthRangeFromPeriodKey(period);

      // Resolve account
      let targetAccount = null;
      if (accountId) {
        targetAccount = await Account.findById(accountId);
      } else {
        targetAccount = await Account.findOne({ user: userId });
      }

      if (!targetAccount) {
        return errorResponse(res, "Account not found", 404);
      }

      // Authorization check: customer can only download their own statement
      if (userRole === "customer" && String(targetAccount.user) !== String(userId)) {
        return errorResponse(res, "Unauthorized to access statements for this account", 403);
      }

      // Compile statement data and PDF buffer
      const statementData = await compileStatementData(targetAccount._id, periodRange);
      const pdfBuffer = await generateStatementPDF(statementData);

      const fileName = isAll
        ? `Flowly_Bank_Statement_${targetAccount.accountNumber}_All_Transactions.pdf`
        : `Flowly_Statement_${targetAccount.accountNumber}_${periodRange.periodKey}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      res.setHeader("Content-Length", pdfBuffer.length);

      return res.send(pdfBuffer);
    } catch (err) {
      console.error("StatementController downloadStatement error:", err);
      return errorResponse(res, err.message, 500);
    }
  }

  /**
   * Request that a statement for a specific month be sent to the customer's email.
   * Body: { period: "YYYY-MM", accountId?: string }
   */
  async emailStatement(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const { period, accountId } = req.body;

      const periodRange = period
        ? getMonthRangeFromPeriodKey(period)
        : getPreviousMonthRange();

      let targetAccount = null;
      if (accountId) {
        targetAccount = await Account.findById(accountId);
      } else {
        targetAccount = await Account.findOne({ user: userId });
      }

      if (!targetAccount) {
        return errorResponse(res, "Account not found", 404);
      }

      if (req.user.role === "customer" && String(targetAccount.user) !== String(userId)) {
        return errorResponse(res, "Unauthorized to access this account", 403);
      }

      const result = await processAccountMonthlyStatement(targetAccount, periodRange, {
        sendEmail: true,
        force: true, // Allow user-requested re-send
      });

      return successResponse(res, {
        data: result,
        message: `Statement for ${periodRange.monthName} has been emailed to ${result.customerEmail}`,
      });
    } catch (err) {
      console.error("StatementController emailStatement error:", err);
      return errorResponse(res, err.message, 500);
    }
  }

  /**
   * Admin / Worker endpoint to trigger the monthly statement generation batch on demand.
   * Body: { period?: "YYYY-MM", force?: boolean, accountId?: string, userId?: string }
   */
  async triggerMonthlyStatements(req, res) {
    try {
      const { period, force = false, accountId, userId } = req.body || {};

      console.log(`[Admin Trigger] Generating monthly statements. Period: ${period || "previous-month"}, Force: ${force}`);

      const summary = await generateAndEmailAllMonthlyStatements({
        periodKey: period || undefined,
        force,
        accountId,
        userId,
        sendEmail: true,
      });

      return successResponse(res, {
        data: summary,
        message: `Monthly statements generation completed for ${summary.monthName}. Sent: ${summary.sentCount}, Skipped: ${summary.skippedCount}, Failed: ${summary.failedCount}`,
      });
    } catch (err) {
      console.error("StatementController triggerMonthlyStatements error:", err);
      return errorResponse(res, err.message, 500);
    }
  }
}

export default new StatementController();
