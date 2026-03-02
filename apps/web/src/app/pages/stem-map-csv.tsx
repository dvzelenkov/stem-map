import { ChangeEvent, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { StemMapInputData, Layer, Stem, Edge } from '@study/trunk-map';

type CsvRow = Record<string, string>;

interface CsvTableData {
  headers: string[];
  rows: CsvRow[];
}

const STEM_MAP_STORAGE_KEY = 'stem-map-uploaded-data';
const STEM_BASE_COLUMNS = ['stem_id', 'label', 'lat', 'lon'];

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const symbol = line[index];

    if (symbol === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (symbol === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += symbol;
  }

  values.push(current.trim());
  return values;
};

const parseCsv = (text: string): CsvTableData => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV-файл должен содержать заголовок и хотя бы одну строку данных.');
  }

  const headers = splitCsvLine(lines[0]).filter((header) => header.length > 0);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
};

const toNumber = (value: string, fieldName: string): number => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Некорректное число в поле "${fieldName}": ${value}`);
  }
  return numberValue;
};

const toBoolean = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const getGeneratedLayers = (headers: string[]): Layer[] => {
  const attributeHeaders = headers.filter(
    (header) => !STEM_BASE_COLUMNS.includes(header)
  );

  if (!attributeHeaders.length) {
    throw new Error(
      'CSV со стемами должен содержать хотя бы один атрибутный столбец помимо stem_id,label,lat,lon.'
    );
  }

  return attributeHeaders.map((attributeName, index) => ({
    layer_id: attributeName,
    title: attributeName,
    attribute_name: attributeName,
    order: index + 1,
  }));
};

const mapStems = (rows: CsvRow[], headers: string[]): Stem[] =>
  rows.map((row) => {
    const { stem_id, label, lat, lon } = row;
    const propertyEntries = headers
      .filter((header) => !STEM_BASE_COLUMNS.includes(header))
      .map((attributeName) => [attributeName, row[attributeName] ?? '']);

    return {
      stem_id,
      label: label || undefined,
      geo: {
        lat: toNumber(lat, 'lat'),
        lon: toNumber(lon, 'lon'),
      },
      properties: Object.fromEntries(propertyEntries),
    };
  });

const mapEdges = (rows: CsvRow[]): Edge[] =>
  rows.map((row) => ({
    edge_id: row.edge_id,
    layer_id: row.attribute_name,
    source_stem_id: row.source_stem_id,
    target_stem_id: row.target_stem_id,
    directed: toBoolean(row.directed || 'false'),
    weight: row.weight ? toNumber(row.weight, 'weight') : null,
  }));

const updateCellValue = (
  table: CsvTableData | null,
  rowIndex: number,
  header: string,
  value: string
): CsvTableData | null => {
  if (!table) {
    return null;
  }

  const rows = table.rows.map((row, index) =>
    index === rowIndex ? { ...row, [header]: value } : row
  );

  return {
    ...table,
    rows,
  };
};

function EditableCsvTable({
  title,
  table,
  onChange,
}: {
  title: string;
  table: CsvTableData | null;
  onChange: (rowIndex: number, header: string, value: string) => void;
}) {
  if (!table) {
    return null;
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {table.headers.map((header) => (
                <TableCell key={header}>{header}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {table.rows.map((row, rowIndex) => (
              <TableRow key={`${title}-${rowIndex}`}>
                {table.headers.map((header) => (
                  <TableCell key={`${title}-${rowIndex}-${header}`}>
                    <TextField
                      size="small"
                      value={row[header] ?? ''}
                      onChange={(event) =>
                        onChange(rowIndex, header, event.target.value)
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export function StemMapCsvPage() {
  const navigate = useNavigate();
  const [stemsTable, setStemsTable] = useState<CsvTableData | null>(null);
  const [edgesTable, setEdgesTable] = useState<CsvTableData | null>(null);
  const [error, setError] = useState<string>('');

  const generatedLayers = useMemo(() => {
    if (!stemsTable) {
      return [];
    }

    try {
      return getGeneratedLayers(stemsTable.headers);
    } catch {
      return [];
    }
  }, [stemsTable]);

  const handleUpload =
    (setter: (value: CsvTableData | null) => void) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      setError('');
      const file = event.target.files?.[0];

      if (!file) {
        setter(null);
        return;
      }

      try {
        const text = await file.text();
        setter(parseCsv(text));
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : 'Не удалось разобрать CSV'
        );
      }
    };

  const handleSaveAndOpenMap = () => {
    setError('');

    if (!stemsTable || !edgesTable) {
      setError('Сначала загрузите CSV-файлы стемов и связей.');
      return;
    }

    try {
      const layers = getGeneratedLayers(stemsTable.headers);
      const layerIds = new Set(layers.map((layer) => layer.layer_id));
      const stems = mapStems(stemsTable.rows, stemsTable.headers);
      const stemIds = new Set(stems.map((stem) => stem.stem_id));
      const edges = mapEdges(edgesTable.rows);

      for (const edge of edges) {
        if (!layerIds.has(edge.layer_id)) {
          throw new Error(
            `Связь "${edge.edge_id}" ссылается на неизвестный атрибут "${edge.layer_id}".`
          );
        }

        if (!stemIds.has(edge.source_stem_id) || !stemIds.has(edge.target_stem_id)) {
          throw new Error(
            `Связь "${edge.edge_id}" ссылается на неизвестный stem_id.`
          );
        }
      }

      const data: StemMapInputData = {
        layers,
        stems,
        edges,
        copies: 'implicit',
      };

      localStorage.setItem(STEM_MAP_STORAGE_KEY, JSON.stringify(data));
      navigate('/trunk-map');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить данные');
    }
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Загрузка и редактирование CSV
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Button component="label" variant="outlined">
            CSV стемов
            <input hidden type="file" accept=".csv" onChange={handleUpload(setStemsTable)} />
          </Button>
          <Button component="label" variant="outlined">
            CSV связей
            <input hidden type="file" accept=".csv" onChange={handleUpload(setEdgesTable)} />
          </Button>
        </Stack>

        <Paper variant="outlined" sx={{ mt: 2, p: 2, backgroundColor: '#fafafa' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Формат входных данных
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              <strong>CSV стемов:</strong> обязательные поля `stem_id, label, lat, lon`.
              Все остальные столбцы считаются атрибутами.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              <strong>CSV связей:</strong> обязательные поля
              `edge_id, attribute_name, source_stem_id, target_stem_id, directed, weight`.
            </Typography>
            <Typography component="li" variant="body2">
              Слои генерируются автоматически по названиям атрибутов из CSV стемов.
            </Typography>
          </Box>
        </Paper>

        {!!generatedLayers.length && (
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            <strong>Сгенерированные слои:</strong>{' '}
            {generatedLayers.map((layer) => layer.layer_id).join(', ')}
          </Typography>
        )}

        <Stack
          direction="row"
          spacing={2}
          flexWrap="wrap"
          sx={{ mt: 2, width: '100%' }}
          justifyContent="space-between"
        >
          <Button variant="text" onClick={() => navigate('/trunk-map')}>
            Назад на карту
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveAndOpenMap}
            disabled={!stemsTable || !edgesTable}
          >
            Сохранить и открыть карту
          </Button>
        </Stack>

        {error && (
          <Alert sx={{ mt: 2 }} severity="error">
            {error}
          </Alert>
        )}
      </Paper>

      <EditableCsvTable
        title="Таблица стемов"
        table={stemsTable}
        onChange={(rowIndex, header, value) => {
          setStemsTable((prev) => updateCellValue(prev, rowIndex, header, value));
        }}
      />

      <EditableCsvTable
        title="Таблица связей"
        table={edgesTable}
        onChange={(rowIndex, header, value) => {
          setEdgesTable((prev) => updateCellValue(prev, rowIndex, header, value));
        }}
      />
    </Box>
  );
}

export default StemMapCsvPage;
