"use client";

import { useMemo, useState } from "react";
import type { Account, Transaction } from "@/lib/types";
import { STATEMENT_PAGE_SIZE, TXN_TYPE_LABELS } from "@/lib/constants";
import { formatINR, formatIST, maskAccountNumber, sumINR, toISTDateKey } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, EmptyState, TransactionAmount, buttonStyles } from "@/components/ui/bits";
import { inputClass } from "@/components/ui/form";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconSearch,
  IconStatement,
} from "@/components/icons";

const ALL = "all" as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function StatementTable({
  transactions,
  accounts,
}: {
  transactions: Transaction[];
  accounts: Account[];
}) {
  const [accountId, setAccountId] = useState<string>(ALL);
  const [txnType, setTxnType] = useState<string>(ALL);
  const [direction, setDirection] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (accountId !== ALL && t.account_id !== accountId) return false;
      if (txnType !== ALL && t.txn_type !== txnType) return false;
      if (direction !== ALL && t.direction !== direction) return false;
      if (q) {
        const haystack = `${t.memo ?? ""} ${t.reference} ${TXN_TYPE_LABELS[t.txn_type]}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (fromDate || toDate) {
        const key = toISTDateKey(t.created_at);
        if (fromDate && key < fromDate) return false;
        if (toDate && key > toDate) return false;
      }
      return true;
    });
  }, [transactions, accountId, txnType, direction, query, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / STATEMENT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * STATEMENT_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + STATEMENT_PAGE_SIZE);

  const moneyIn = sumINR(filtered.filter((t) => t.direction === "CREDIT").map((t) => t.amount));
  const moneyOut = sumINR(filtered.filter((t) => t.direction === "DEBIT").map((t) => t.amount));

  const hasFilters =
    accountId !== ALL || txnType !== ALL || direction !== ALL || !!fromDate || !!toDate || !!query;

  function resetFilters() {
    setAccountId(ALL);
    setTxnType(ALL);
    setDirection(ALL);
    setFromDate("");
    setToDate("");
    setQuery("");
    setPage(1);
  }

  function exportCsv() {
    const header = [
      "Date (IST)",
      "Reference",
      "Account",
      "Type",
      "Direction",
      "Amount (INR)",
      "Balance after (INR)",
      "Memo",
      "Status",
    ];
    const rows = filtered.map((t) => {
      const account = accountsById.get(t.account_id);
      return [
        formatIST(t.created_at),
        t.reference,
        account ? maskAccountNumber(account.account_number) : t.account_id,
        TXN_TYPE_LABELS[t.txn_type],
        t.direction === "CREDIT" ? "Credit" : "Debit",
        Number(t.amount).toFixed(2),
        Number(t.balance_after).toFixed(2),
        t.memo ?? "",
        t.status,
      ].map(csvCell);
    });
    const csv = `${[header.map(csvCell), ...rows].map((r) => r.join(",")).join("\r\n")}\r\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `banksim-statement-${toISTDateKey(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<IconStatement className="h-5 w-5" />}
        title="Your statement is empty"
        description="No money has moved yet. Make a transfer or a deposit and every entry will appear here with its reference and running balance."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <select
            aria-label="Account"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          >
            <option value={ALL}>All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.type === "CHECKING" ? "Checking" : "Savings"} {maskAccountNumber(a.account_number)}
              </option>
            ))}
          </select>

          <select
            aria-label="Type"
            value={txnType}
            onChange={(e) => {
              setTxnType(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          >
            <option value={ALL}>All types</option>
            <option value="TRANSFER_IN">Transfer in</option>
            <option value="TRANSFER_OUT">Transfer out</option>
            <option value="DEPOSIT">Deposit</option>
            <option value="WITHDRAWAL">Withdrawal</option>
          </select>

          <select
            aria-label="Direction"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          >
            <option value={ALL}>Credits & debits</option>
            <option value="CREDIT">Credits only</option>
            <option value="DEBIT">Debits only</option>
          </select>

          <input
            aria-label="From date"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          />

          <input
            aria-label="To date"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          />

          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search memo or reference"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search memo / ref"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
            {" · "}
            <span className="font-medium text-emerald-600">In {formatINR(moneyIn)}</span>
            {" · "}
            <span className="font-medium text-red-600">Out {formatINR(moneyOut)}</span>
          </p>
          <div className="flex items-center gap-2">
            {hasFilters ? (
              <button type="button" onClick={resetFilters} className={buttonStyles.ghost}>
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className={buttonStyles.secondary}
            >
              <IconDownload className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[56rem] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Date (IST)</th>
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Details</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-right font-semibold">Balance after</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No transactions match your filters.{" "}
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="font-semibold text-navy-700 underline-offset-2 hover:underline"
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                pageRows.map((t) => {
                  const account = accountsById.get(t.account_id);
                  return (
                    <tr key={t.id} className="transition hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatIST(t.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">
                        {t.reference}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {account ? maskAccountNumber(account.account_number) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge
                          tone={
                            t.txn_type === "DEPOSIT"
                              ? "emerald"
                              : t.txn_type === "WITHDRAWAL"
                                ? "red"
                                : "navy"
                          }
                        >
                          {TXN_TYPE_LABELS[t.txn_type]}
                        </Badge>
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-slate-700">
                        {t.memo || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <TransactionAmount value={t.amount} direction={t.direction} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatINR(t.balance_after)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            t.status === "COMPLETED"
                              ? "text-slate-500"
                              : t.status === "FAILED"
                                ? "text-red-600"
                                : "text-amber-600",
                          )}
                        >
                          {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            {filtered.length === 0
              ? "0 of 0"
              : `Showing ${start + 1}–${Math.min(start + STATEMENT_PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            {" · "}Page {safePage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className={buttonStyles.secondary}
              aria-label="Previous page"
            >
              <IconChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className={buttonStyles.secondary}
              aria-label="Next page"
            >
              Next
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
