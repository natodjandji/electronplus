import { inflateRawSync } from 'zlib';
import { buildXlsx, columnName } from './xlsx';

/** Reads a zip back through its central directory. */
function unzip(buffer: Buffer): Map<string, string> {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(at)).toBe(0x02014b50);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const offset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const start = offset + 30 + localNameLength;
    files.set(name, inflateRawSync(buffer.subarray(start, start + size)).toString('utf8'));
    at += 46 + nameLength;
  }
  return files;
}

describe('buildXlsx', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 9, 25, 26, 27, 701].map(columnName)).toEqual(['A', 'J', 'Z', 'AA', 'AB', 'ZZ']);
  });

  it('writes a workbook with one sheet, a bold header, text and numbers', () => {
    const files = unzip(
      buildXlsx('Publicaciones', [
        ['Título', 'Precio'],
        ['Bombillo <LED> & "9W"', 11.6],
        ['Bombillo <LED> & "9W"', 3],
      ]),
    );
    expect([...files.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/sharedStrings.xml',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Publicaciones"');
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<c r="A1" s="1" t="s"><v>0</v></c>');
    expect(sheet).toContain('<c r="B2"><v>11.6</v></c>');
    // The repeated text is stored once.
    expect(sheet).toContain('<c r="A3" t="s"><v>2</v></c>');
    const strings = files.get('xl/sharedStrings.xml')!;
    expect(strings).toContain('uniqueCount="3"');
    expect(strings).toContain('Bombillo &lt;LED&gt; &amp; &quot;9W&quot;');
    expect(strings).toContain('Título');
  });

  it("drops characters XML can't carry", () => {
    const files = unzip(buildXlsx('S', [['a\u0001b\u000bc\nd']]));
    expect(files.get('xl/sharedStrings.xml')).toContain('abc\nd');
  });
});
