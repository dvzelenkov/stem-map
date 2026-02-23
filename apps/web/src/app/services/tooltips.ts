import { PickingInfo } from '@deck.gl/core/typed';
import { TooltipContent } from '@deck.gl/core/src/lib/tooltip';
import { Earthquake, getDate } from '@study/shared';

const getDateDayOrMonth = (value: number): string => {
  return value.toString().length === 1 ? `0${value}` : value.toString();
};

export const getEarthquakeTooltip = ({ object }: PickingInfo): TooltipContent => {
  if (object && object.force) {
    const earthquake: Earthquake = object;
    return `K: ${earthquake.force}${'\n'}`
      + `Дата: ${getDateDayOrMonth(getDate(earthquake.date).getDay())}`
      + `.${getDateDayOrMonth(getDate(object.date).getMonth())}`
      + `.${getDate(object.date).getFullYear()}${'\n'}`
      + `Ширина: ${object.latitude}${'\n'}Долгота: ${object.longitude}`;
  }
  return null;
};