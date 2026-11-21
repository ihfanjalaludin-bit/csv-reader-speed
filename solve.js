// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference program).
//
// Written from the RULES.txt reading policy, not from the reference code:
// the text is read once, left to right, with commas and double quotes.
// A U+FEFF at the very start is dropped. A record ends at LF or CRLF, and
// a line left with no characters is no record. Outside quotes a CR not
// followed by LF is dropped (stray_cr). A field that opens with a quote
// runs to the next quote that is not doubled, "" inside it is one quote,
// and each CRLF or lone CR inside it is read as LF; whatever follows the
// closing quote, up to the next comma or line break, is appended as it
// stands (quote_junk, when the field ends). A quote that never closes is
// a literal character, and the text after it is read again as unquoted
// (unterminated_quote). A quote inside an unquoted field is a literal
// character. Fields stay strings, never trimmed or converted. columns is
// the first record when header is true, else null; rows holds the records
// after it (every record when header is false), each padded with "" or
// cut to the first record's width (short_row / long_row). Each error is
// {code, line, row}, in the order met; line is the 1-based line the
// record starts on, row is the record's index in rows (null for the
// header). Nothing is cached between calls; no network; deterministic.
//
// Speed comes from never building a field character by character:
// unquoted fields are taken with indexOf(',') plus a bounded scan of the
// segment for LF/CR, and quoted fields are taken with indexOf('"') for
// the closing quote plus a slice of the contents, so the hot paths run in
// the engine's native string search instead of a JS per-character loop.
// String slices are views, and a field is materialised only when a stray
// CR or a quoted-field fix-up forces a join/replace.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows
  // it takes (null: the header). Errors report these, as met.
  let recordLine = 1;
  let recordRow = null;

  // The last field read: its value, how it ended, and (for an unquoted
  // read) how many characters were kept. Out-parameters, so no object is
  // allocated per field.
  let fv = '';
  let fe = END;
  let fa = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). It sets fv/fe/fa:
  // the field, how it ended, and how many characters were kept.
  // The common case (no LF/CR before the next comma or the end) is one
  // indexOf(',') plus two short bounded scans of the segment.
  function readUnquoted(value) {
    fa = 0;
    let parts = null; // pieces once a stray CR forces a join
    for (;;) {
      const cIdx = text.indexOf(',', pos);
      const segEnd = cIdx === -1 ? len : cIdx;
      const seg = text.slice(pos, segEnd);
      const n = seg.indexOf('\n');
      const r = seg.indexOf('\r');
      if (n === -1 && r === -1) {
        if (parts === null) value += seg;
        else parts.push(seg);
        fa += seg.length;
        fv = parts === null ? value : parts.join('');
        if (cIdx === -1) {
          pos = len;
          fe = END;
          return;
        }
        pos = cIdx + 1;
        fe = COMMA;
        return;
      }
      if (r !== -1 && (n === -1 || r < n)) {
        if (seg.charCodeAt(r + 1) === 10) {
          // CRLF: one line break, the CR is not part of the field.
          const f = seg.slice(0, r);
          if (parts === null) value += f;
          else parts.push(f);
          fa += f.length;
          pos += r + 2;
          line += 1;
          fv = parts === null ? value : parts.join('');
          fe = LINE_BREAK;
          return;
        }
        // Lone CR: dropped, the field goes on after it.
        error('stray_cr');
        const f = seg.slice(0, r);
        if (parts === null) parts = [value, f];
        else parts.push(f);
        fa += f.length;
        pos += r + 1;
        continue;
      }
      // LF first: the field ends here (any CR in the segment is past it).
      const f = seg.slice(0, n);
      if (parts === null) value += f;
      else parts.push(f);
      fa += f.length;
      pos += n + 1;
      line += 1;
      fv = parts === null ? value : parts.join('');
      fe = LINE_BREAK;
      return;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    // Find the closing quote: a quote followed by another quote is a
    // doubled quote inside the field, not the end of it.
    let q = text.indexOf('"', pos);
    let close = -1;
    while (q !== -1) {
      if (text.charCodeAt(q + 1) === 34) {
        q = text.indexOf('"', q + 2);
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      readUnquoted('"');
      return;
    }
    let value = text.slice(open + 1, close);
    if (
      value.indexOf('"') !== -1 ||
      value.indexOf('\n') !== -1 ||
      value.indexOf('\r') !== -1
    ) {
      // Each CRLF or lone CR inside quotes is one LF; count them first.
      const breaks = value.match(/\r\n|\r|\n/g);
      if (breaks !== null) line += breaks.length;
      value = value.replace(/\r\n?/g, '\n').replace(/""/g, '"');
    }
    pos = close + 1;
    if (pos >= len) {
      fv = value;
      fe = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fv = value;
      fe = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to
    // the next comma or line break.
    readUnquoted(value);
    if (fa > 0) error('quote_junk');
  }

  // Finish a record: the header is kept as it is; other records are
  // padded with "" or cut to the first record's width.
  function finish(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fv);
    } while (fe === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finish(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
