import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDuration } from "@/lib/utils/format";
import type { SessionReportData } from "@/types/session.types";

// jspdf-autotable mutates the jsPDF instance it's given with a
// `lastAutoTable` property at runtime; its own types declare the doc
// parameter as `any`, so there's nothing to import for this shape.
interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

const PAGE_MARGIN_X = 40;

export function generateSessionReportPdf(data: SessionReportData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as JsPDFWithAutoTable;

  doc.setFontSize(18);
  doc.text(data.sessionName, PAGE_MARGIN_X, 50);

  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`${data.clubName} · ${data.sessionDate}`, PAGE_MARGIN_X, 68);
  doc.text(
    data.endTime ? `${data.startTime} – ${data.endTime}` : data.startTime,
    PAGE_MARGIN_X,
    84
  );
  doc.setTextColor(0);

  doc.setFontSize(13);
  doc.text("Session Summary", PAGE_MARGIN_X, 112);

  autoTable(doc, {
    startY: 122,
    theme: "plain",
    margin: { left: PAGE_MARGIN_X },
    styles: { fontSize: 10 },
    body: [
      ["Total Players", String(data.totalPlayers)],
      ["Total Matches Played", String(data.totalMatches)],
      [
        "Average Match Duration",
        data.avgMatchDurationSecs != null ? formatDuration(data.avgMatchDurationSecs) : "—",
      ],
      [
        "Session Duration",
        data.sessionDurationSecs != null ? formatDuration(data.sessionDurationSecs) : "—",
      ],
    ],
  });

  const afterSummaryY = doc.lastAutoTable.finalY + 28;
  doc.setFontSize(13);
  doc.text("Court Usage", PAGE_MARGIN_X, afterSummaryY);

  autoTable(doc, {
    startY: afterSummaryY + 10,
    margin: { left: PAGE_MARGIN_X },
    head: [["Court", "Matches Played"]],
    body: data.courts.length > 0
      ? data.courts.map((c) => [c.courtName, String(c.matchesPlayed)])
      : [["—", "0"]],
  });

  const afterCourtsY = doc.lastAutoTable.finalY + 28;
  doc.setFontSize(13);
  doc.text("Leaderboard", PAGE_MARGIN_X, afterCourtsY);

  autoTable(doc, {
    startY: afterCourtsY + 10,
    margin: { left: PAGE_MARGIN_X },
    head: [["Rank", "Player", "Wins", "Losses", "Games", "Win Rate"]],
    body: data.leaderboard.length > 0
      ? data.leaderboard.map((p) => [
          String(p.rank),
          p.displayName,
          String(p.wins),
          String(p.losses),
          String(p.gamesPlayed),
          `${p.winRate}%`,
        ])
      : [["—", "No players joined this session", "", "", "", ""]],
  });

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Generated ${new Date(data.generatedAt).toLocaleString()}`,
    PAGE_MARGIN_X,
    doc.internal.pageSize.getHeight() - 24
  );

  return new Uint8Array(doc.output("arraybuffer"));
}
