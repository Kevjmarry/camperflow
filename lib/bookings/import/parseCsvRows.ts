function detectDelimiter(headerLine: string): string {
  return headerLine.includes("\t") ? "\t" : ",";
}

function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      fields.push("");
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      let value = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped quote
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      // skip delimiter
      if (line[i] === delimiter) i++;
    } else {
      // Unquoted field
      const start = i;
      while (i < line.length && line[i] !== delimiter) i++;
      fields.push(line.slice(start, i).trim());
      if (line[i] === delimiter) i++;
    }
  }

  return fields;
}

export function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const result: Record<string, string>[] = [];

  let delimiter: string | undefined;
  let headers: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;

    if (delimiter === undefined) {
      delimiter = detectDelimiter(line);
      headers = parseLine(line, delimiter).map((h) => h.trim());
      continue;
    }

    const values = parseLine(line, delimiter);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }
    result.push(row);
  }

  return result;
}
