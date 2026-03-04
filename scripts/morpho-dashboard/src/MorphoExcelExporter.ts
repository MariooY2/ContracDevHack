import type { MorphoMarketData } from "./types.js";

/**
 * Stub Excel exporter — not needed for JSON refresh workflow.
 * Install exceljs and implement if you need .xlsx output.
 */
export class MorphoExcelExporter {
  async exportToExcel(_markets: MorphoMarketData[], _filename?: string): Promise<void> {
    console.log("⚠ Excel export not implemented in this script. Use --json instead.");
  }
}
