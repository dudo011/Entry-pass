(() => {
  const TOKEN_KEY = 'ep_token';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const STATUS = { pending: '대기', approved: '승인', rejected: '반려' };

  const escapeXml = (value) => String(value == null ? '' : value)
    .replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const columnName = (index) => {
    let result = '';
    let value = index + 1;
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  };

  const crcTable = (() => {
    const table = [];
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let k = 0; k < 8; k += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
      table[n] = value >>> 0;
    }
    return table;
  })();

  const crc32 = (bytes) => {
    let value = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) value = crcTable[(value ^ bytes[i]) & 0xFF] ^ (value >>> 8);
    return (value ^ 0xFFFFFFFF) >>> 0;
  };

  function zipStore(files) {
    const u16 = (value) => [value & 255, (value >> 8) & 255];
    const u32 = (value) => [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
      const name = new TextEncoder().encode(file.name);
      const crc = crc32(file.data);
      const size = file.data.length;
      const localHeader = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(20513),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)];
      const local = new Uint8Array(localHeader.length + name.length + size);
      local.set(localHeader, 0);
      local.set(name, localHeader.length);
      local.set(file.data, localHeader.length + name.length);
      chunks.push(local);

      const centralHeader = [0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(20513),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)];
      const directory = new Uint8Array(centralHeader.length + name.length);
      directory.set(centralHeader, 0);
      directory.set(name, centralHeader.length);
      central.push(directory);
      offset += local.length;
    }

    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0)]);
    const output = new Uint8Array(chunks.reduce((sum, item) => sum + item.length, 0) + centralSize + end.length);
    let position = 0;
    for (const item of chunks) { output.set(item, position); position += item.length; }
    for (const item of central) { output.set(item, position); position += item.length; }
    output.set(end, position);
    return output;
  }

  function displayLength(value) {
    return [...String(value == null ? '' : value)].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 2 : 1), 0);
  }

  function buildXlsx(sheetName, rows) {
    const encoder = new TextEncoder();
    const columnCount = Math.max(...rows.map((row) => row.length), 1);
    const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
      const longest = Math.max(...rows.map((row) => displayLength(row[columnIndex] || '')), 4);
      return Math.min(Math.max(longest + 3, 10), 42);
    });
    const columnsXml = widths.map((width, index) =>
      `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');

    let rowsXml = '';
    rows.forEach((row, rowIndex) => {
      const cells = row.map((value, columnIndex) =>
        `<c r="${columnName(columnIndex)}${rowIndex + 1}" s="${rowIndex === 0 ? 2 : 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join('');
      rowsXml += `<row r="${rowIndex + 1}">${cells}</row>`;
    });

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${columnsXml}</cols><sheetData>${rowsXml}</sheetData></worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    return zipStore([
      { name: '[Content_Types].xml', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: '_rels/.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
      { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
      { name: 'xl/styles.xml', data: encoder.encode(styles) },
      { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet) },
    ]);
  }

  function parseDate(value) {
    const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async function exportExcel(event) {
    const button = event.target.closest?.('#st-csv');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '생성 중…';
    try {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      const response = await fetch('/api/requests', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('출입 신청 데이터를 불러오지 못했습니다.');
      let records = await response.json();

      const from = document.getElementById('st-from')?.value || '';
      const to = document.getElementById('st-to')?.value || '';
      const typeId = document.getElementById('st-type')?.value || '';
      const vehicle = document.getElementById('st-vehicle')?.value.trim().toLowerCase() || '';
      const company = document.getElementById('st-company')?.value.trim().toLowerCase() || '';

      records = records.filter((record) => {
        const visit = String(record.visitAt || '').slice(0, 10);
        if (from && visit < from) return false;
        if (to && visit > to) return false;
        if (typeId && record.vehicleTypeId !== typeId) return false;
        if (vehicle && !String(record.vehicleNumber || '').toLowerCase().includes(vehicle)) return false;
        if (company && !String(record.company || '').toLowerCase().includes(company)) return false;
        return true;
      });

      const header = ['방문일자', '요일', '차량번호', '방문목적', '계약업체', '연락처', '상태', '신청일시'];
      const rows = [header, ...records.map((record) => {
        const date = parseDate(record.visitAt);
        const purpose = String(record.vehicleTypeName || '').replace(/\s*차량\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return [
          date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '',
          date ? WD[date.getDay()] : '',
          record.vehicleNumber || '',
          purpose,
          record.company || '',
          record.phone || '',
          STATUS[record.status] || record.status || '',
          record.createdAt ? new Date(record.createdAt).toLocaleString('ko-KR') : '',
        ];
      })];

      const data = buildXlsx('조회결과', rows);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'entry-stats.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert(error.message || 'Excel 파일 생성 중 오류가 발생했습니다.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  document.addEventListener('click', exportExcel, true);
})();