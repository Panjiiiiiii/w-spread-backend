// Temporary debug script: dumps the raw text pdf-parse extracts from a
// statement PDF, so the BANK_LINE_PATTERNS in statement.service.ts can be
// checked/tuned against real bank exports.
//
// Usage: node debug-parse.js path/to/your-statement.pdf

const path = require('path');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node debug-parse.js <path-to-pdf>');
    process.exit(1);
  }

  const fs = require('fs');
  const { CanvasFactory } = await import('pdf-parse/worker');
  const { PDFParse } = await import('pdf-parse');

  const buffer = fs.readFileSync(path.resolve(filePath));
  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    const result = await parser.getText();
    console.log('--- RAW TEXT START ---');
    console.log(result.text);
    console.log('--- RAW TEXT END ---');
    console.log('\n--- LINE BY LINE (normalized, matching what the parser sees) ---');
    const lines = result.text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    lines.forEach((line, i) => console.log(`${i}: ${JSON.stringify(line)}`));
  } finally {
    await parser.destroy();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
