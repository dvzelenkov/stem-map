import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
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
const STEM_MAP_EDITOR_STORAGE_KEY = 'stem-map-csv-editor-data';
const STEM_BASE_COLUMNS = ['stem_id', 'label', 'lat', 'lon'];
type StemMapCsvTab = 'stems' | 'edges' | 'layers';

interface StemMapCsvEditorStorageData {
  stemsTable: CsvTableData | null;
  edgesTable: CsvTableData | null;
  activeTab: StemMapCsvTab;
  layerColors: Record<string, string>;
}

interface StemMapCsvTablesData {
  stemsTable: CsvTableData | null;
  edgesTable: CsvTableData | null;
}

interface StoredStemMapData {
  data: StemMapInputData;
  layerColors: Record<string, string>;
}

const DEFAULT_LAYER_COLOR = '#1976d2';
const COLOR_GENERATION_ATTEMPTS = 50;

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

const isCsvTableData = (value: unknown): value is CsvTableData => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeTable = value as Partial<CsvTableData>;
  const hasValidHeaders =
    Array.isArray(maybeTable.headers) &&
    maybeTable.headers.every((header) => typeof header === 'string');
  const hasValidRows =
    Array.isArray(maybeTable.rows) &&
    maybeTable.rows.every((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return false;
      }

      return Object.values(row).every((cell) => typeof cell === 'string');
    });

  return hasValidHeaders && hasValidRows;
};

const getStoredStemMapCsvEditorData = (): StemMapCsvEditorStorageData | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawData = localStorage.getItem(STEM_MAP_EDITOR_STORAGE_KEY);
  if (!rawData) {
    return null;
  }

  try {
    const parsedData = JSON.parse(rawData) as Partial<StemMapCsvEditorStorageData>;

    return {
      stemsTable: isCsvTableData(parsedData.stemsTable) ? parsedData.stemsTable : null,
      edgesTable: isCsvTableData(parsedData.edgesTable) ? parsedData.edgesTable : null,
      activeTab:
        parsedData.activeTab === 'edges' || parsedData.activeTab === 'layers'
          ? parsedData.activeTab
          : 'stems',
      layerColors:
        parsedData.layerColors && typeof parsedData.layerColors === 'object'
          ? Object.fromEntries(
              Object.entries(parsedData.layerColors)
                .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
                .map(([key, value]) => [key, normalizeHexColor(value)])
            )
          : {},
    };
  } catch {
    return null;
  }
};

const getStoredStemMapData = (): StoredStemMapData | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawData = localStorage.getItem(STEM_MAP_STORAGE_KEY);
  if (!rawData) {
    return null;
  }

  try {
    const parsedData = JSON.parse(rawData) as StemMapInputData & {
      layerColors?: Record<string, string>;
    };

    if (
      !Array.isArray(parsedData.layers) ||
      !Array.isArray(parsedData.stems) ||
      !Array.isArray(parsedData.edges)
    ) {
      return null;
    }

    const layerColors =
      parsedData.layerColors && typeof parsedData.layerColors === 'object'
        ? Object.fromEntries(
            Object.entries(parsedData.layerColors)
              .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
              .map(([key, value]) => [key, normalizeHexColor(value)])
          )
        : {};

    return {
      data: parsedData,
      layerColors,
    };
  } catch {
    return null;
  }
};

const toTableCell = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

const normalizeHexColor = (value: string): string => {
  const isHexColor = /^#[0-9a-fA-F]{6}$/.test(value);
  return isHexColor ? value.toLowerCase() : DEFAULT_LAYER_COLOR;
};

const getRandomColor = (): string => {
  const value = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `#${value}`;
};

const hexToRgb = (hexColor: string): { red: number; green: number; blue: number } => {
  const normalized = normalizeHexColor(hexColor);
  return {
    red: parseInt(normalized.slice(1, 3), 16),
    green: parseInt(normalized.slice(3, 5), 16),
    blue: parseInt(normalized.slice(5, 7), 16),
  };
};

const getColorDistance = (leftColor: string, rightColor: string): number => {
  const leftRgb = hexToRgb(leftColor);
  const rightRgb = hexToRgb(rightColor);
  return Math.sqrt(
    (leftRgb.red - rightRgb.red) ** 2 +
      (leftRgb.green - rightRgb.green) ** 2 +
      (leftRgb.blue - rightRgb.blue) ** 2
  );
};

const getDistinctRandomColor = (existingColors: string[]): string => {
  if (!existingColors.length) {
    return getRandomColor();
  }

  let bestColor = getRandomColor();
  let bestDistance = -1;

  for (let index = 0; index < COLOR_GENERATION_ATTEMPTS; index += 1) {
    const candidateColor = getRandomColor();
    const minDistanceToExisting = Math.min(
      ...existingColors.map((existingColor) => getColorDistance(candidateColor, existingColor))
    );

    if (minDistanceToExisting > bestDistance) {
      bestDistance = minDistanceToExisting;
      bestColor = candidateColor;
    }
  }

  return bestColor;
};

const getTablesFromStemMapData = (data: StemMapInputData): StemMapCsvTablesData => {
  const getLayerOrder = (layer: Layer): number =>
    typeof layer.order === 'number' ? layer.order : 0;

  const layerAttributeNames = [...data.layers]
    .sort((leftLayer, rightLayer) => getLayerOrder(leftLayer) - getLayerOrder(rightLayer))
    .map((layer) => layer.attribute_name || layer.layer_id);

  const extraAttributes = new Set<string>();
  data.stems.forEach((stem) => {
    Object.keys(stem.properties || {}).forEach((propertyName) => {
      if (!layerAttributeNames.includes(propertyName)) {
        extraAttributes.add(propertyName);
      }
    });
  });

  const stemHeaders = [...STEM_BASE_COLUMNS, ...layerAttributeNames, ...Array.from(extraAttributes)];
  const stemsTable: CsvTableData = {
    headers: stemHeaders,
    rows: data.stems.map((stem) => {
      const row: CsvRow = {
        stem_id: toTableCell(stem.stem_id),
        label: toTableCell(stem.label),
        lat: toTableCell(stem.geo?.lat),
        lon: toTableCell(stem.geo?.lon),
      };

      stemHeaders
        .filter((header) => !STEM_BASE_COLUMNS.includes(header))
        .forEach((attributeName) => {
          row[attributeName] = toTableCell(stem.properties?.[attributeName]);
        });

      return row;
    }),
  };

  const edgesTable: CsvTableData = {
    headers: ['edge_id', 'attribute_name', 'source_stem_id', 'target_stem_id', 'directed', 'weight'],
    rows: data.edges.map((edge) => ({
      edge_id: toTableCell(edge.edge_id),
      attribute_name: toTableCell(edge.layer_id),
      source_stem_id: toTableCell(edge.source_stem_id),
      target_stem_id: toTableCell(edge.target_stem_id),
      directed: String(Boolean(edge.directed)),
      weight: toTableCell(edge.weight),
    })),
  };

  return { stemsTable, edgesTable };
};

const getRestoredStemMapCsvEditorData = (): StemMapCsvEditorStorageData | null => {
  const storedEditorData = getStoredStemMapCsvEditorData();
  if (storedEditorData && (storedEditorData.stemsTable || storedEditorData.edgesTable)) {
    return storedEditorData;
  }

  const storedMapData = getStoredStemMapData();
  if (!storedMapData) {
    return storedEditorData;
  }

  const { stemsTable, edgesTable } = getTablesFromStemMapData(storedMapData.data);
  return {
    stemsTable,
    edgesTable,
    activeTab: storedEditorData?.activeTab ?? 'stems',
    layerColors: Object.keys(storedEditorData?.layerColors ?? {}).length
      ? storedEditorData?.layerColors ?? {}
      : storedMapData.layerColors,
  };
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
      'CSV со стволами должен содержать хотя бы один атрибутный столбец помимо stem_id,label,lat,lon.'
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
  selectOptionsByHeader,
  getSelectOptionsByCell,
  isCellInvalid,
  checkboxHeaders,
}: {
  title: string;
  table: CsvTableData | null;
  onChange: (rowIndex: number, header: string, value: string) => void;
  selectOptionsByHeader?: Partial<Record<string, string[]>>;
  getSelectOptionsByCell?: (rowIndex: number, header: string, row: CsvRow) => string[] | undefined;
  isCellInvalid?: (rowIndex: number, header: string, value: string) => boolean;
  checkboxHeaders?: string[];
}) {
  if (!table) {
    return null;
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {table.headers.map((header) => (
                <TableCell key={header} sx={{ fontSize: 12, py: 1 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {table.rows.map((row, rowIndex) => (
              <TableRow key={`${title}-${rowIndex}`}>
                {table.headers.map((header) => {
                  const value = row[header] ?? '';
                  const selectOptions =
                    getSelectOptionsByCell?.(rowIndex, header, row) ?? selectOptionsByHeader?.[header];
                  const isCheckbox = checkboxHeaders?.includes(header) ?? false;
                  const renderedSelectOptions =
                    selectOptions && value && !selectOptions.includes(value)
                      ? [...selectOptions, value]
                      : selectOptions;
                  const hasError = isCellInvalid?.(rowIndex, header, value) ?? false;

                  return (
                    <TableCell key={`${title}-${rowIndex}-${header}`} sx={{ py: 0.5 }}>
                      {isCheckbox ? (
                        <Checkbox
                          size="small"
                          checked={toBoolean(value || 'false')}
                          onChange={(event) =>
                            onChange(rowIndex, header, String(event.target.checked))
                          }
                        />
                      ) : renderedSelectOptions ? (
                        <TextField
                          select
                          size="small"
                          value={value}
                          error={hasError}
                          onChange={(event) =>
                            onChange(rowIndex, header, event.target.value)
                          }
                          sx={{
                            minWidth: 180,
                            '& .MuiInputBase-input': {
                              fontSize: 12,
                              py: 0.5,
                            },
                          }}
                        >
                          {renderedSelectOptions.map((option) => (
                            <MenuItem key={option} value={option} sx={{ fontSize: 12, minHeight: 28 }}>
                              {option}
                            </MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        <TextField
                          size="small"
                          value={value}
                          error={hasError}
                          onChange={(event) =>
                            onChange(rowIndex, header, event.target.value)
                          }
                          sx={{
                            '& .MuiInputBase-input': {
                              fontSize: 12,
                              py: 0.5,
                            },
                          }}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export function StemMapCsvPage() {
  const restoredEditorData = useMemo(() => getRestoredStemMapCsvEditorData(), []);
  const navigate = useNavigate();
  const [stemsTable, setStemsTable] = useState<CsvTableData | null>(
    restoredEditorData?.stemsTable ?? null
  );
  const [edgesTable, setEdgesTable] = useState<CsvTableData | null>(
    restoredEditorData?.edgesTable ?? null
  );
  const [activeTab, setActiveTab] = useState<StemMapCsvTab>(
    restoredEditorData?.activeTab ?? 'stems'
  );
  const [layerColors, setLayerColors] = useState<Record<string, string>>(
    restoredEditorData?.layerColors ?? {}
  );
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storageData: StemMapCsvEditorStorageData = {
      stemsTable,
      edgesTable,
      activeTab,
      layerColors,
    };

    localStorage.setItem(STEM_MAP_EDITOR_STORAGE_KEY, JSON.stringify(storageData));
  }, [activeTab, edgesTable, layerColors, stemsTable]);

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

  useEffect(() => {
    setLayerColors((prevColors) => {
      const nextColors: Record<string, string> = {};
      const usedColors: string[] = [];
      generatedLayers.forEach((layer) => {
        const existingColor = prevColors[layer.layer_id];
        const nextColor = existingColor
          ? normalizeHexColor(existingColor)
          : getDistinctRandomColor(usedColors);
        nextColors[layer.layer_id] = nextColor;
        usedColors.push(nextColor);
      });
      return nextColors;
    });
  }, [generatedLayers]);

  const stemAttributeHeaders = useMemo(
    () =>
      stemsTable?.headers.filter((header) => !STEM_BASE_COLUMNS.includes(header)) ?? [],
    [stemsTable]
  );
  const stemRows = useMemo(() => stemsTable?.rows ?? [], [stemsTable]);

  const handleUpload =
    (setter: (value: CsvTableData | null) => void, tab: StemMapCsvTab) =>
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
        setActiveTab(tab);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : 'Не удалось разобрать CSV'
        );
      }
    };

  const handleSaveAndOpenMap = () => {
    setError('');

    if (!stemsTable || !edgesTable) {
      setError('Сначала загрузите CSV-файлы стволов и связей.');
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

      localStorage.setItem(
        STEM_MAP_STORAGE_KEY,
        JSON.stringify({
          ...data,
          layerColors,
        })
      );
      navigate('/trunk-map');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить данные');
    }
  };

  const handleClearData = () => {
    setStemsTable(null);
    setEdgesTable(null);
    setLayerColors({});
    setActiveTab('stems');
    setError('');

    if (typeof window !== 'undefined') {
      localStorage.removeItem(STEM_MAP_EDITOR_STORAGE_KEY);
      localStorage.removeItem(STEM_MAP_STORAGE_KEY);
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
            CSV стволов
            <input
              hidden
              type="file"
              accept=".csv"
              onChange={handleUpload(setStemsTable, 'stems')}
            />
          </Button>
          <Button component="label" variant="outlined" disabled={!stemsTable}>
            CSV связей
            <input
              hidden
              type="file"
              accept=".csv"
              onChange={handleUpload(setEdgesTable, 'edges')}
            />
          </Button>
        </Stack>

        <Paper variant="outlined" sx={{ mt: 2, p: 2, backgroundColor: '#fafafa' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Формат входных данных
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              <strong>CSV стволов:</strong> обязательные поля `stem_id, label, lat, lon`.
              Все остальные столбцы считаются атрибутами.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              <strong>CSV связей:</strong> обязательные поля
              `edge_id, attribute_name, source_stem_id, target_stem_id, directed, weight`.
            </Typography>
            <Typography component="li" variant="body2">
              Слои генерируются автоматически по названиям атрибутов из CSV стволов.
            </Typography>
          </Box>
        </Paper>

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
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" color="error" onClick={handleClearData}>
              Очистить данные
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveAndOpenMap}
              disabled={!stemsTable || !edgesTable}
            >
              Сохранить и открыть карту
            </Button>
          </Stack>
        </Stack>

        {error && (
          <Alert sx={{ mt: 2 }} severity="error">
            {error}
          </Alert>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Tabs value={activeTab} onChange={(_, value: StemMapCsvTab) => setActiveTab(value)}>
          <Tab value="stems" label="Стволы" />
          <Tab value="edges" label="Связи" />
          <Tab value="layers" label="Слои" />
        </Tabs>

        <Box sx={{ mt: 2 }}>
          {activeTab === 'stems' ? (
            <EditableCsvTable
              title="Таблица стволов"
              table={stemsTable}
              onChange={(rowIndex, header, value) => {
                setStemsTable((prev) => updateCellValue(prev, rowIndex, header, value));
              }}
            />
          ) : activeTab === 'edges' ? (
            <EditableCsvTable
              title="Таблица связей"
              table={edgesTable}
              checkboxHeaders={['directed']}
              getSelectOptionsByCell={(_, header, row) => {
                if (header === 'attribute_name') {
                  return stemAttributeHeaders;
                }

                if (header !== 'source_stem_id' && header !== 'target_stem_id') {
                  return undefined;
                }

                const selectedAttributeName = row.attribute_name;
                const availableStemIds = stemRows
                  .filter((stemRow) => {
                    const stemId = (stemRow.stem_id ?? '').trim();
                    if (!stemId) {
                      return false;
                    }

                    if (!selectedAttributeName) {
                      return true;
                    }

                    const attributeValue = stemRow[selectedAttributeName];
                    return typeof attributeValue === 'string' && attributeValue.trim() !== '';
                  })
                  .map((stemRow) => stemRow.stem_id)
                  .filter((stemId): stemId is string => typeof stemId === 'string' && !!stemId);

                if (header === 'source_stem_id') {
                  return availableStemIds.filter((stemId) => stemId !== row.target_stem_id);
                }

                return availableStemIds.filter((stemId) => stemId !== row.source_stem_id);
              }}
              isCellInvalid={(rowIndex, header, value) => {
                if (header === 'attribute_name') {
                  return !!value && !stemAttributeHeaders.includes(value);
                }

                if (header === 'source_stem_id' || header === 'target_stem_id') {
                  if (!value) {
                    return false;
                  }

                  const row = edgesTable?.rows[rowIndex];
                  if (!row) {
                    return false;
                  }

                  const options = (() => {
                    const selectedAttributeName = row.attribute_name;
                    const availableStemIds = stemRows
                      .filter((stemRow) => {
                        const stemId = (stemRow.stem_id ?? '').trim();
                        if (!stemId) {
                          return false;
                        }

                        if (!selectedAttributeName) {
                          return true;
                        }

                        const attributeValue = stemRow[selectedAttributeName];
                        return (
                          typeof attributeValue === 'string' && attributeValue.trim() !== ''
                        );
                      })
                      .map((stemRow) => stemRow.stem_id)
                      .filter(
                        (stemId): stemId is string => typeof stemId === 'string' && !!stemId
                      );

                    if (header === 'source_stem_id') {
                      return availableStemIds.filter((stemId) => stemId !== row.target_stem_id);
                    }

                    return availableStemIds.filter((stemId) => stemId !== row.source_stem_id);
                  })();

                  return !options.includes(value);
                }

                return false;
              }}
              onChange={(rowIndex, header, value) => {
                setEdgesTable((prev) => updateCellValue(prev, rowIndex, header, value));
              }}
            />
          ) : (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Таблица слоёв
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: 12, py: 1 }}>layer_id</TableCell>
                      <TableCell sx={{ fontSize: 12, py: 1 }}>attribute_name</TableCell>
                      <TableCell sx={{ fontSize: 12, py: 1 }}>color</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {generatedLayers.map((layer) => (
                      <TableRow key={layer.layer_id}>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}>{layer.layer_id}</TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}>{layer.attribute_name}</TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <TextField
                            type="color"
                            size="small"
                            value={layerColors[layer.layer_id] ?? DEFAULT_LAYER_COLOR}
                            onChange={(event) =>
                              setLayerColors((prevColors) => ({
                                ...prevColors,
                                [layer.layer_id]: normalizeHexColor(event.target.value),
                              }))
                            }
                            sx={{ width: 72 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {!generatedLayers.length && (
                <Typography variant="body2" color="text.secondary">
                  Сначала загрузите таблицу стволов, чтобы сгенерировать слои.
                </Typography>
              )}
            </Box>
          )}

          {activeTab === 'stems' && !stemsTable && (
            <Typography variant="body2" color="text.secondary">
              Загрузите CSV стволов, чтобы увидеть и редактировать таблицу.
            </Typography>
          )}
          {activeTab === 'edges' && !edgesTable && (
            <Typography variant="body2" color="text.secondary">
              Загрузите CSV связей, чтобы увидеть и редактировать таблицу.
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

export default StemMapCsvPage;
