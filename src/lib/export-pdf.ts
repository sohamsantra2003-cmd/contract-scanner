import jsPDF from "jspdf";
import type { ScanResult } from "@/lib/scan-utils";

function scoreGrade(score: number): string {
  if (score <= 20) return "A";
  if (score <= 40) return "B";
  if (score <= 60) return "C";
  if (score <= 80) return "D";
  return "F";
}

function severityLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    payment_terms: "Payment Terms",
    liability: "Liability",
    auto_renewal: "Auto-Renewal",
    IP: "Intellectual Property",
    termination: "Termination",
    other: "Other",
  };
  return map[c] ?? c;
}

type RGB = [number, number, number];

const INDIGO:   RGB = [79,  70,  229];
const BLACK:    RGB = [15,  15,  20];
const DARK:     RGB = [40,  40,  50];
const MUTED:    RGB = [120, 120, 135];
const RED:      RGB = [220, 53,  69];
const AMBER:    RGB = [255, 165, 0];
const GREEN:    RGB = [34,  197, 94];
const LIGHT_BG: RGB = [248, 248, 252];

export function exportScanReport(scan: ScanResult, contractTitle: string): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 20;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  function tc(rgb: RGB) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
  function fc(rgb: RGB) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
  function dc(rgb: RGB) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }

  function checkPageBreak(needed: number) {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  // ── HEADER ────────────────────────────────────────────────────────────────
  fc(INDIGO);
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("Contract Scanner", MARGIN, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 240);
  doc.text("AI-Powered Contract Risk Report", MARGIN, 19);

  const dateStr = new Date(scan.scanned_at).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
  doc.text(dateStr, PAGE_W - MARGIN, 19, { align: "right" });

  y = 36;

  // ── CONTRACT TITLE ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  tc(BLACK);
  const titleLines = doc.splitTextToSize(contractTitle, CONTENT_W);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 7 + 6;

  dc(INDIGO);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // ── RISK SCORE BLOCK ──────────────────────────────────────────────────────
  const grade = scoreGrade(scan.risk_score);
  const scoreCol: RGB =
    scan.risk_score <= 29 ? GREEN : scan.risk_score <= 69 ? AMBER : RED;

  fc(LIGHT_BG);
  dc([220, 220, 230]);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, 32, 3, 3, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(scoreCol[0], scoreCol[1], scoreCol[2]);
  doc.text(String(scan.risk_score), MARGIN + 8, y + 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  tc(MUTED);
  doc.text("/100", MARGIN + 8 + doc.getTextWidth(String(scan.risk_score)) + 2, y + 21);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(scoreCol[0], scoreCol[1], scoreCol[2]);
  doc.text(`Grade: ${grade}`, MARGIN + 50, y + 21);

  const riskLabel =
    scan.risk_score <= 29 ? "LOW RISK" : scan.risk_score <= 69 ? "MEDIUM RISK" : "HIGH RISK";
  doc.setFontSize(9);
  doc.setTextColor(scoreCol[0], scoreCol[1], scoreCol[2]);
  doc.text(riskLabel, PAGE_W - MARGIN - 4, y + 21, { align: "right" });

  const high = scan.clauses.filter((c) => c.severity === "high").length;
  const med  = scan.clauses.filter((c) => c.severity === "medium").length;
  const low  = scan.clauses.filter((c) => c.severity === "low").length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  tc(MUTED);
  doc.text(
    `${scan.clauses.length} clauses identified: ${high} High · ${med} Medium · ${low} Low`,
    MARGIN + 8, y + 27
  );

  y += 40;

  // ── EXECUTIVE SUMMARY ─────────────────────────────────────────────────────
  checkPageBreak(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  tc(INDIGO);
  doc.text("EXECUTIVE SUMMARY", MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  tc(DARK);
  const summaryLines = doc.splitTextToSize(scan.summary, CONTENT_W);
  doc.text(summaryLines, MARGIN, y);
  y += summaryLines.length * 5 + 10;

  // ── RISK SCORE BAR ────────────────────────────────────────────────────────
  checkPageBreak(14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  tc(MUTED);
  doc.text("RISK LEVEL", MARGIN, y);
  y += 4;

  fc([220, 220, 230]);
  doc.roundedRect(MARGIN, y, CONTENT_W, 5, 2, 2, "F");
  fc(scoreCol);
  const barWidth = (scan.risk_score / 100) * CONTENT_W;
  doc.roundedRect(MARGIN, y, barWidth, 5, 2, 2, "F");
  y += 12;

  // ── CLAUSE BREAKDOWN ──────────────────────────────────────────────────────
  checkPageBreak(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  tc(BLACK);
  doc.text("Clause-by-Clause Risk Breakdown", MARGIN, y);
  y += 8;

  const sorted = [...scan.clauses].sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  sorted.forEach((clause, idx) => {
    const clauseLines   = doc.splitTextToSize(`"${clause.text}"`, CONTENT_W - 12);
    const explLines     = doc.splitTextToSize(clause.explanation, CONTENT_W - 12);
    const rewriteLines  = doc.splitTextToSize(clause.rewrite, CONTENT_W - 12);
    const cardHeight    = clauseLines.length * 4.5 + explLines.length * 4.5 + rewriteLines.length * 4.5 + 34;

    checkPageBreak(cardHeight + 4);

    const severityBg: RGB =
      clause.severity === "high"   ? [255, 245, 245] :
      clause.severity === "medium" ? [255, 250, 235] :
                                     [240, 253, 244];
    fc(severityBg);
    dc([220, 220, 230]);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, cardHeight, 2, 2, "FD");

    const stripeCol: RGB =
      clause.severity === "high" ? RED : clause.severity === "medium" ? AMBER : GREEN;
    fc(stripeCol);
    doc.rect(MARGIN, y, 3, cardHeight, "F");

    const cx = MARGIN + 7;
    let cy = y + 6;

    // Severity + category
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(stripeCol[0], stripeCol[1], stripeCol[2]);
    const sevText = severityLabel(clause.severity).toUpperCase();
    doc.text(sevText, cx, cy);

    tc(MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(`  ·  ${categoryLabel(clause.category)}`, cx + doc.getTextWidth(sevText), cy);

    tc(MUTED);
    doc.text(`#${idx + 1}`, PAGE_W - MARGIN - 4, cy, { align: "right" });
    cy += 6;

    // Clause text
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    tc(DARK);
    doc.text(clauseLines, cx, cy);
    cy += clauseLines.length * 4.5 + 4;

    // Explanation
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    tc(MUTED);
    doc.text("WHY THIS MATTERS", cx, cy);
    cy += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    tc(DARK);
    doc.text(explLines, cx, cy);
    cy += explLines.length * 4.5 + 4;

    // Safer alternative
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    tc(INDIGO);
    doc.text("SAFER ALTERNATIVE", cx, cy);
    cy += 4;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    tc(DARK);
    doc.text(rewriteLines, cx, cy);

    y += cardHeight + 4;
  });

  // ── FOOTER on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    fc(LIGHT_BG);
    doc.rect(0, PAGE_H - 12, PAGE_W, 12, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    tc(MUTED);
    doc.text(
      "Generated by Contract Scanner · AI-powered legal risk analysis",
      MARGIN, PAGE_H - 5
    );
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 5, { align: "right" });
  }

  // ── DISCLAIMER PAGE ───────────────────────────────────────────────────────
  doc.addPage();
  y = MARGIN + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  tc(BLACK);
  doc.text("Important Disclaimer", MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  tc(DARK);
  const disclaimer =
    "This report was generated by Contract Scanner using AI (Google Gemini 2.5 Flash) and is provided for informational purposes only. It does not constitute legal advice and should not be relied upon as a substitute for professional legal counsel. The analysis identifies potential risk areas based on common contract law principles but may not capture all risks relevant to your specific jurisdiction, industry, or circumstances. Always consult a qualified lawyer before signing any contract.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, CONTENT_W);
  doc.text(disclaimerLines, MARGIN, y);

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const safeTitle = contractTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 50);
  const dateForFilename = new Date().toISOString().slice(0, 10);
  doc.save(`contract-risk-report-${safeTitle}-${dateForFilename}.pdf`);
}
