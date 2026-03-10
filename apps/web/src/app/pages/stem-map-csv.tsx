import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Backdrop,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
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

export const parseCsv = (text: string): CsvTableData => {
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

export const getGeneratedLayers = (headers: string[]): Layer[] => {
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

export const mapStems = (rows: CsvRow[], headers: string[]): Stem[] =>
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

const appendEmptyRow = (table: CsvTableData | null): CsvTableData | null => {
  if (!table) {
    return null;
  }

  const newRow = Object.fromEntries(table.headers.map((header) => [header, ''])) as CsvRow;
  return {
    ...table,
    rows: [...table.rows, newRow],
  };
};

const removeRow = (table: CsvTableData | null, rowIndex: number): CsvTableData | null => {
  if (!table) {
    return null;
  }

  if (table.rows.length <= 1) {
    return null;
  }

  return {
    ...table,
    rows: table.rows.filter((_, index) => index !== rowIndex),
  };
};

const addStemAttribute = (table: CsvTableData | null, attributeName: string): CsvTableData | null => {
  if (!table) {
    return null;
  }

  const trimmedName = attributeName.trim();
  if (!trimmedName || table.headers.includes(trimmedName)) {
    return table;
  }

  return {
    headers: [...table.headers, trimmedName],
    rows: table.rows.map((row) => ({
      ...row,
      [trimmedName]: '',
    })),
  };
};

const renameStemAttribute = (
  table: CsvTableData | null,
  previousName: string,
  nextName: string
): CsvTableData | null => {
  if (!table || previousName === nextName || !table.headers.includes(previousName)) {
    return table;
  }

  const headers = table.headers.map((header) => (header === previousName ? nextName : header));
  const rows = table.rows.map((row) => {
    const { [previousName]: previousValue, ...restRow } = row;
    return {
      ...restRow,
      [nextName]: previousValue ?? '',
    };
  });

  return { headers, rows };
};

const removeStemAttribute = (table: CsvTableData | null, attributeName: string): CsvTableData | null => {
  if (!table || !table.headers.includes(attributeName)) {
    return table;
  }

  return {
    headers: table.headers.filter((header) => header !== attributeName),
    rows: table.rows.map((row) => {
      const { [attributeName]: _, ...restRow } = row;
      return restRow;
    }),
  };
};

const replaceEdgeAttributeName = (
  table: CsvTableData | null,
  previousName: string,
  nextName: string
): CsvTableData | null => {
  if (!table || previousName === nextName) {
    return table;
  }

  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      attribute_name: row.attribute_name === previousName ? nextName : row.attribute_name,
    })),
  };
};

const clearEdgeAttributeName = (
  table: CsvTableData | null,
  attributeName: string
): CsvTableData | null => {
  if (!table) {
    return table;
  }

  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      attribute_name: row.attribute_name === attributeName ? '' : row.attribute_name,
    })),
  };
};

const isFilledValue = (value: string | undefined): boolean => (value ?? '').trim() !== '';

const isStemRowReadyForNext = (row: CsvRow, headers: string[]): boolean => {
  const hasFilledBaseColumns = STEM_BASE_COLUMNS.every((columnName) => isFilledValue(row[columnName]));
  if (!hasFilledBaseColumns) {
    return false;
  }

  const attributeHeaders = headers.filter((header) => !STEM_BASE_COLUMNS.includes(header));
  if (!attributeHeaders.length) {
    return true;
  }

  return attributeHeaders.some((attributeHeader) => isFilledValue(row[attributeHeader]));
};

const isEdgeRowReadyForNext = (row: CsvRow, headers: string[]): boolean =>
  headers
    .filter((header) => header !== 'directed')
    .every((header) => isFilledValue(row[header]));

function EditableCsvTable({
  title,
  table,
  titleControls,
  onChange,
  onAddRow,
  onDeleteRow,
  canAddRow,
  addRowDisabledReason,
  selectOptionsByHeader,
  getSelectOptionsByCell,
  onHeaderClick,
  onHeaderDelete,
  isHeaderEditable,
  isCellInvalid,
  checkboxHeaders,
}: {
  title: string;
  table: CsvTableData | null;
  titleControls?: ReactNode;
  onChange: (rowIndex: number, header: string, value: string) => void;
  onAddRow?: () => void;
  onDeleteRow?: (rowIndex: number) => void;
  canAddRow?: boolean;
  addRowDisabledReason?: string;
  selectOptionsByHeader?: Partial<Record<string, string[]>>;
  getSelectOptionsByCell?: (rowIndex: number, header: string, row: CsvRow) => string[] | undefined;
  onHeaderClick?: (header: string) => void;
  onHeaderDelete?: (header: string) => void;
  isHeaderEditable?: (header: string) => boolean;
  isCellInvalid?: (rowIndex: number, header: string, value: string) => boolean;
  checkboxHeaders?: string[];
}) {
  const [page, setPage] = useState<number>(0);
  const rowsPerPage = 50;
  const totalRows = table?.rows.length ?? 0;
  const maxPage = Math.max(0, Math.ceil(totalRows / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const pageStartIndex = safePage * rowsPerPage;
  const pageRows = table?.rows.slice(pageStartIndex, pageStartIndex + rowsPerPage) ?? [];

  if (!table) {
    return null;
  }

  const cellSx = {
    '& .MuiInputBase-input': { fontSize: 12, py: 0.5 },
    '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#37474f' }}>
            {title}
          </Typography>
          <Chip label={`${totalRows} строк`} size="small" sx={{ height: 20, fontSize: 11 }} />
        </Stack>
        {onAddRow && (
          <Button
            size="small"
            variant="outlined"
            onClick={onAddRow}
            disabled={canAddRow === false}
            sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
          >
            + Запись
          </Button>
        )}
      </Stack>
      {titleControls && <Box sx={{ mb: 1.5 }}>{titleControls}</Box>}
      <TableContainer sx={{ borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: '#f5f7fa' }}>
              {table.headers.map((header) => {
                const editableHeader = isHeaderEditable?.(header) ?? false;
                return (
                  <TableCell
                    key={header}
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#546e7a',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      py: 1,
                      borderBottom: '2px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Box
                        component="span"
                        onClick={() => editableHeader && onHeaderClick?.(header)}
                        sx={{
                          cursor: editableHeader && onHeaderClick ? 'pointer' : 'default',
                          '&:hover': editableHeader ? { color: '#2979ff' } : {},
                        }}
                      >
                        {header}
                      </Box>
                      {editableHeader && onHeaderDelete && (
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onHeaderDelete(header);
                          }}
                          sx={{
                            p: 0.2,
                            color: '#b0bec5',
                            '&:hover': { color: '#e53935' },
                          }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                );
              })}
              {onDeleteRow && (
                <TableCell
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#546e7a',
                    py: 1,
                    width: 56,
                    borderBottom: '2px solid rgba(0,0,0,0.06)',
                  }}
                />
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((row, pageRowIndex) => {
              const rowIndex = pageStartIndex + pageRowIndex;
              return (
                <TableRow
                  key={`${title}-${rowIndex}`}
                  sx={{
                    '&:nth-of-type(even)': { background: 'rgba(0,0,0,0.015)' },
                    '&:hover': { background: 'rgba(41,121,255,0.03)' },
                  }}
                >
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
                      <TableCell
                        key={`${title}-${rowIndex}-${header}`}
                        sx={{ py: 0.3, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                      >
                        {isCheckbox ? (
                          <Checkbox
                            size="small"
                            checked={toBoolean(value || 'false')}
                            onChange={(event) =>
                              onChange(rowIndex, header, String(event.target.checked))
                            }
                            sx={{ p: 0.3 }}
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
                            sx={{ minWidth: 160, ...cellSx }}
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
                            sx={cellSx}
                          />
                        )}
                      </TableCell>
                    );
                  })}
                  {onDeleteRow && (
                    <TableCell sx={{ py: 0.3, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <IconButton
                        size="small"
                        onClick={() => onDeleteRow(rowIndex)}
                        sx={{ color: '#b0bec5', '&:hover': { color: '#e53935' } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={totalRows}
        page={safePage}
        onPageChange={(_, nextPage) => setPage(nextPage)}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[50]}
        sx={{ '& .MuiTablePagination-toolbar': { minHeight: 40 } }}
      />
      {onAddRow && canAddRow === false && !!addRowDisabledReason && (
        <Typography variant="caption" sx={{ color: '#90a4ae', display: 'block', mt: 0.5 }}>
          {addRowDisabledReason}
        </Typography>
      )}
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
  const [newAttributeName, setNewAttributeName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [isTabSwitching, setIsTabSwitching] = useState<boolean>(false);

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
  const canAddStemRow = useMemo(() => {
    if (!stemsTable || !stemsTable.rows.length) {
      return true;
    }

    return stemsTable.rows.every((row) => isStemRowReadyForNext(row, stemsTable.headers));
  }, [stemsTable]);
  const canAddEdgeRow = useMemo(() => {
    if (!edgesTable || !edgesTable.rows.length) {
      return true;
    }

    return edgesTable.rows.every((row) => isEdgeRowReadyForNext(row, edgesTable.headers));
  }, [edgesTable]);
  const hasAttributeWithAtLeastTwoStems = useMemo(() => {
    if (!stemsTable) {
      return false;
    }

    return stemAttributeHeaders.some((attributeName) => {
      const filledCount = stemRows.filter((stemRow) => {
        const attributeValue = stemRow[attributeName];
        return typeof attributeValue === 'string' && attributeValue.trim() !== '';
      }).length;

      return filledCount >= 2;
    });
  }, [stemAttributeHeaders, stemRows, stemsTable]);

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
        setIsImporting(true);
        const text = await file.text();
        setter(parseCsv(text));
        setActiveTab(tab);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : 'Не удалось разобрать CSV'
        );
      } finally {
        setIsImporting(false);
      }
    };

  const handleSaveAndOpenMap = () => {
    setError('');

    if (!stemsTable) {
      setError('Сначала загрузите CSV-файл стволов.');
      return;
    }

    try {
      const layers = getGeneratedLayers(stemsTable.headers);
      const layerIds = new Set(layers.map((layer) => layer.layer_id));
      const stems = mapStems(stemsTable.rows, stemsTable.headers);
      const stemIds = new Set(stems.map((stem) => stem.stem_id));
      const edges = edgesTable ? mapEdges(edgesTable.rows) : [];

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
    setNewAttributeName('');
    setError('');

    if (typeof window !== 'undefined') {
      localStorage.removeItem(STEM_MAP_EDITOR_STORAGE_KEY);
      localStorage.removeItem(STEM_MAP_STORAGE_KEY);
    }
  };

  const handleAddStemAttribute = () => {
    setError('');
    const nextAttributeName = newAttributeName.trim();

    if (!stemsTable) {
      setError('Сначала загрузите CSV стволов.');
      return;
    }

    if (!nextAttributeName) {
      setError('Введите имя нового атрибута.');
      return;
    }

    if (STEM_BASE_COLUMNS.includes(nextAttributeName) || stemsTable.headers.includes(nextAttributeName)) {
      setError(`Атрибут "${nextAttributeName}" уже существует или зарезервирован.`);
      return;
    }

    setStemsTable((prev) => addStemAttribute(prev, nextAttributeName));
    setNewAttributeName('');
  };

  const handleRenameStemAttributeByHeader = (previousName: string) => {
    if (!stemsTable || STEM_BASE_COLUMNS.includes(previousName)) {
      return;
    }

    const rawNextName = window.prompt('Новое имя атрибута', previousName);
    if (rawNextName === null) {
      return;
    }

    const nextName = rawNextName.trim();
    setError('');

    if (!nextName) {
      setError('Введите новое имя атрибута.');
      return;
    }

    if (STEM_BASE_COLUMNS.includes(nextName)) {
      setError(`Имя "${nextName}" зарезервировано.`);
      return;
    }

    if (nextName !== previousName && stemsTable.headers.includes(nextName)) {
      setError(`Атрибут "${nextName}" уже существует.`);
      return;
    }

    setStemsTable((prev) => renameStemAttribute(prev, previousName, nextName));
    setEdgesTable((prev) => replaceEdgeAttributeName(prev, previousName, nextName));
    setLayerColors((prevColors) => {
      if (!(previousName in prevColors) || previousName === nextName) {
        return prevColors;
      }

      const { [previousName]: previousColor, ...restColors } = prevColors;
      return {
        ...restColors,
        [nextName]: previousColor,
      };
    });
  };

  const handleDeleteStemAttributeByHeader = (attributeName: string) => {
    if (STEM_BASE_COLUMNS.includes(attributeName)) {
      return;
    }

    const confirmed = window.confirm(`Удалить атрибут "${attributeName}"?`);
    if (!confirmed) {
      return;
    }

    setError('');
    setStemsTable((prev) => removeStemAttribute(prev, attributeName));
    setEdgesTable((prev) => clearEdgeAttributeName(prev, attributeName));
    setLayerColors((prevColors) => {
      if (!(attributeName in prevColors)) {
        return prevColors;
      }

      const { [attributeName]: _, ...restColors } = prevColors;
      return restColors;
    });
  };

  const handleAddStemRow = () => {
    if (!canAddStemRow) {
      setError(
        'Перед добавлением новой записи заполните все обязательные поля. Для атрибутов нужно заполнить хотя бы одно поле в каждой строке.'
      );
      return;
    }

    setError('');
    setStemsTable((prevTable) => {
      if (!prevTable) {
        return {
          headers: [...STEM_BASE_COLUMNS],
          rows: [
            {
              stem_id: '',
              label: '',
              lat: '',
              lon: '',
            },
          ],
        };
      }

      return appendEmptyRow(prevTable);
    });
  };

  const handleDeleteStemRow = (rowIndex: number) => {
    setStemsTable((prev) => removeRow(prev, rowIndex));
  };

  const handleAddEdgeRow = () => {
    if (!hasAttributeWithAtLeastTwoStems) {
      setError(
        'Добавление связи доступно только если минимум у двух стволов заполнено значение хотя бы одного атрибута.'
      );
      return;
    }

    if (!canAddEdgeRow) {
      setError('Перед добавлением новой связи заполните все поля в текущих строках.');
      return;
    }

    setError('');
    setEdgesTable((prevTable) => {
      const selectedAttribute = stemAttributeHeaders[0] ?? '';
      const availableStemIds = stemRows
        .filter((stemRow) => {
          const stemId = (stemRow.stem_id ?? '').trim();
          if (!stemId) {
            return false;
          }

          if (!selectedAttribute) {
            return true;
          }

          const attributeValue = stemRow[selectedAttribute];
          return typeof attributeValue === 'string' && attributeValue.trim() !== '';
        })
        .map((stemRow) => stemRow.stem_id)
        .filter((stemId): stemId is string => typeof stemId === 'string' && !!stemId);

      const sourceStemId = availableStemIds[0] ?? '';
      const targetStemId = availableStemIds.find((stemId) => stemId !== sourceStemId) ?? '';
      const nextRow: CsvRow = {
        edge_id: '',
        attribute_name: selectedAttribute,
        source_stem_id: sourceStemId,
        target_stem_id: targetStemId,
        directed: 'false',
        weight: '',
      };

      if (!prevTable) {
        return {
          headers: ['edge_id', 'attribute_name', 'source_stem_id', 'target_stem_id', 'directed', 'weight'],
          rows: [nextRow],
        };
      }

      return {
        ...prevTable,
        rows: [
          ...prevTable.rows,
          nextRow,
        ],
      };
    });
    setActiveTab('edges');
  };

  const handleDeleteEdgeRow = (rowIndex: number) => {
    setEdgesTable((prev) => removeRow(prev, rowIndex));
  };

  return (
    <Box sx={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header bar */}
      <Paper
        elevation={0}
        sx={{
          px: 3,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 0,
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Tooltip title="Назад на карту">
            <IconButton onClick={() => navigate('/trunk-map')} sx={{ color: '#546e7a' }}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#37474f' }}>
            CSV редактор
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              component="label"
              variant="outlined"
              size="small"
              startIcon={<CloudUploadIcon />}
              sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
            >
              Стволы
              <input hidden type="file" accept=".csv" onChange={handleUpload(setStemsTable, 'stems')} />
            </Button>
            <Button
              component="label"
              variant="outlined"
              size="small"
              startIcon={<CloudUploadIcon />}
              disabled={!stemsTable}
              sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
            >
              Связи
              <input hidden type="file" accept=".csv" onChange={handleUpload(setEdgesTable, 'edges')} />
            </Button>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            variant="text"
            size="small"
            color="error"
            onClick={handleClearData}
            startIcon={<DeleteOutlineIcon />}
            sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
          >
            Очистить
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleSaveAndOpenMap}
            disabled={!stemsTable}
            startIcon={<SaveIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 12,
              px: 2.5,
              background: '#37474f',
              '&:hover': { background: '#455a64' },
            }}
          >
            Сохранить и открыть карту
          </Button>
        </Stack>
      </Paper>

      {/* Format hint */}
      <Paper
        elevation={0}
        sx={{
          mx: 3,
          mt: 2,
          px: 2,
          py: 1.2,
          borderRadius: 2,
          background: 'rgba(41,121,255,0.04)',
          border: '1px solid rgba(41,121,255,0.12)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 16, mt: 0.2, color: '#2979ff', flexShrink: 0 }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#37474f', display: 'block', mb: 0.3 }}>
              CSV стволов
            </Typography>
            <Typography variant="caption" sx={{ color: '#607d8b', lineHeight: 1.5 }}>
              Обязательные: <code style={{ fontSize: 11 }}>stem_id, label, lat, lon</code>
              <br />
              Остальные столбцы — атрибуты (слои генерируются автоматически)
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#37474f', display: 'block', mb: 0.3 }}>
              CSV связей
            </Typography>
            <Typography variant="caption" sx={{ color: '#607d8b', lineHeight: 1.5 }}>
              Поля: <code style={{ fontSize: 11 }}>edge_id, attribute_name, source_stem_id, target_stem_id, directed, weight</code>
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mx: 3, mt: 1.5, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Content */}
      <Box sx={{ p: 3 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid rgba(0,0,0,0.06)',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, value: StemMapCsvTab) => {
              if (value === activeTab) return;
              setIsTabSwitching(true);
              window.setTimeout(() => {
                setActiveTab(value);
                setIsTabSwitching(false);
              }, 120);
            }}
            sx={{
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              px: 2,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 13,
                minHeight: 44,
              },
            }}
          >
            <Tab value="stems" label={`Стволы${stemsTable ? ` (${stemsTable.rows.length})` : ''}`} />
            <Tab value="edges" label={`Связи${edgesTable ? ` (${edgesTable.rows.length})` : ''}`} />
            <Tab value="layers" label={`Слои (${generatedLayers.length})`} />
          </Tabs>

          <Box sx={{ p: 2.5 }}>
            {activeTab === 'stems' ? (
              <Box>
                <EditableCsvTable
                  title="Таблица стволов"
                  table={stemsTable}
                  titleControls={
                    stemsTable ? (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          size="small"
                          placeholder="Название нового атрибута"
                          value={newAttributeName}
                          onChange={(event) => setNewAttributeName(event.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddStemAttribute()}
                          sx={{
                            width: 220,
                            '& .MuiInputBase-input': { fontSize: 12, py: 0.7 },
                            '& .MuiOutlinedInput-root': { borderRadius: 2 },
                          }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={handleAddStemAttribute}
                          sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
                        >
                          + Атрибут
                        </Button>
                      </Stack>
                    ) : undefined
                  }
                  onAddRow={handleAddStemRow}
                  onDeleteRow={handleDeleteStemRow}
                  isHeaderEditable={(header) => !STEM_BASE_COLUMNS.includes(header)}
                  onHeaderClick={handleRenameStemAttributeByHeader}
                  onHeaderDelete={handleDeleteStemAttributeByHeader}
                  canAddRow={canAddStemRow}
                  addRowDisabledReason="Заполните обязательные поля во всех строках."
                  onChange={(rowIndex, header, value) => {
                    setStemsTable((prev) => updateCellValue(prev, rowIndex, header, value));
                  }}
                />
                {!stemsTable && (
                  <Stack spacing={1.5} alignItems="center" sx={{ py: 6 }}>
                    <CloudUploadIcon sx={{ fontSize: 48, color: '#b0bec5' }} />
                    <Typography variant="body2" sx={{ color: '#78909c' }}>
                      Загрузите CSV стволов или создайте первый ствол вручную
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleAddStemRow}
                      sx={{ borderRadius: 2, textTransform: 'none' }}
                    >
                      Создать ствол
                    </Button>
                  </Stack>
                )}
              </Box>
            ) : activeTab === 'edges' ? (
              <Box>
                <EditableCsvTable
                  title="Таблица связей"
                  table={edgesTable}
                  onAddRow={handleAddEdgeRow}
                  onDeleteRow={handleDeleteEdgeRow}
                  canAddRow={canAddEdgeRow && hasAttributeWithAtLeastTwoStems}
                  addRowDisabledReason={
                    !hasAttributeWithAtLeastTwoStems
                      ? 'Нужно минимум два ствола с заполненным значением одного атрибута.'
                      : 'Заполните все поля перед добавлением новой связи.'
                  }
                  checkboxHeaders={['directed']}
                  getSelectOptionsByCell={(_, header, row) => {
                    if (header === 'attribute_name') return stemAttributeHeaders;
                    if (header !== 'source_stem_id' && header !== 'target_stem_id') return undefined;
                    const selectedAttributeName = row.attribute_name;
                    const availableStemIds = stemRows
                      .filter((stemRow) => {
                        const stemId = (stemRow.stem_id ?? '').trim();
                        if (!stemId) return false;
                        if (!selectedAttributeName) return true;
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
                    if (header === 'attribute_name') return !!value && !stemAttributeHeaders.includes(value);
                    if (header !== 'source_stem_id' && header !== 'target_stem_id') return false;
                    if (!value) return false;
                    const row = edgesTable?.rows[rowIndex];
                    if (!row) return false;
                    const selectedAttributeName = row.attribute_name;
                    const availableStemIds = stemRows
                      .filter((stemRow) => {
                        const stemId = (stemRow.stem_id ?? '').trim();
                        if (!stemId) return false;
                        if (!selectedAttributeName) return true;
                        const attributeValue = stemRow[selectedAttributeName];
                        return typeof attributeValue === 'string' && attributeValue.trim() !== '';
                      })
                      .map((stemRow) => stemRow.stem_id)
                      .filter((stemId): stemId is string => typeof stemId === 'string' && !!stemId);
                    const opts =
                      header === 'source_stem_id'
                        ? availableStemIds.filter((id) => id !== row.target_stem_id)
                        : availableStemIds.filter((id) => id !== row.source_stem_id);
                    return !opts.includes(value);
                  }}
                  onChange={(rowIndex, header, value) => {
                    setEdgesTable((prev) => updateCellValue(prev, rowIndex, header, value));
                  }}
                />
                {!edgesTable && (
                  <Stack spacing={1.5} alignItems="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: '#78909c' }}>
                      Загрузите CSV связей или создайте первую связь вручную
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleAddEdgeRow}
                      disabled={!hasAttributeWithAtLeastTwoStems}
                      sx={{ borderRadius: 2, textTransform: 'none' }}
                    >
                      Создать связь
                    </Button>
                  </Stack>
                )}
              </Box>
            ) : (
              <Box>
                {generatedLayers.length > 0 ? (
                  <>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#37474f', mb: 1.5 }}>
                      Таблица слоёв
                    </Typography>
                    <TableContainer sx={{ borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ background: '#f5f7fa' }}>
                            <TableCell sx={{ fontSize: 11, fontWeight: 700, color: '#546e7a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              layer_id
                            </TableCell>
                            <TableCell sx={{ fontSize: 11, fontWeight: 700, color: '#546e7a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              attribute_name
                            </TableCell>
                            <TableCell sx={{ fontSize: 11, fontWeight: 700, color: '#546e7a', textTransform: 'uppercase', letterSpacing: 0.5, width: 80 }}>
                              color
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {generatedLayers.map((layer) => (
                            <TableRow
                              key={layer.layer_id}
                              sx={{ '&:hover': { background: 'rgba(41,121,255,0.03)' } }}
                            >
                              <TableCell sx={{ fontSize: 12 }}>{layer.layer_id}</TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{layer.attribute_name}</TableCell>
                              <TableCell>
                                <input
                                  type="color"
                                  value={layerColors[layer.layer_id] ?? DEFAULT_LAYER_COLOR}
                                  onChange={(event) =>
                                    setLayerColors((prevColors) => ({
                                      ...prevColors,
                                      [layer.layer_id]: normalizeHexColor(event.target.value),
                                    }))
                                  }
                                  style={{
                                    width: 32,
                                    height: 24,
                                    padding: 0,
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                ) : (
                  <Stack spacing={1.5} alignItems="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: '#78909c' }}>
                      Загрузите таблицу стволов, чтобы сгенерировать слои
                    </Typography>
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      <Backdrop
        open={isImporting || isTabSwitching}
        sx={{ zIndex: 30, color: '#fff' }}
      >
        <Stack spacing={1} alignItems="center">
          <CircularProgress color="inherit" />
          <Typography variant="body2">
            {isImporting ? 'Импорт CSV...' : 'Переключение...'}
          </Typography>
        </Stack>
      </Backdrop>
    </Box>
  );
}

export default StemMapCsvPage;
