import * as XLSX from 'xlsx';

export default async function handler(req, res) {
  try {
    const origin = 'https://www.erenimanaliz.com';
    const response = await fetch(origin + '/resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
    res.status(200).json({
      headers: Object.keys(rows[0] || {}),
      first: rows[0] || {},
      rows: rows.length,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
}
