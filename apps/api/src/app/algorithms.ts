import { NestedEarthquake, Aftershock, RelationData, getKmBetweenCoordinates, Earthquake } from "@study/shared";

export function molchanDmitrievoy(mains: Earthquake[], earthquakes: Earthquake[]) {
  const nestedMainMarks: NestedEarthquake[] = [];
  const aftershocks: Aftershock[] = [];
  const mainTimelines: RelationData[] = [];
  const aftershockTimelines: RelationData[] = [];

  for (let index = 0; index < mains.length; index++) {
    const mainEarthquake = mains[index];
    const nextMainEarthquake = mains[index + 1];
      
    if (nextMainEarthquake) {
      mainTimelines.push({
        sourceId: mainEarthquake.id,
        targetId: nextMainEarthquake.id,
        sourcePosition: [mainEarthquake.longitude, mainEarthquake.latitude, 10000],
        targetPosition: [nextMainEarthquake.longitude, nextMainEarthquake.latitude, 10000],
        sourceDate: mainEarthquake.date,
        targetDate: nextMainEarthquake.date,
      });
    }

    let rMax = 3.5 * Math.pow(10, (1 / 3) * (mainEarthquake.force - 11));
    rMax = rMax > 1000 ? 1000 : Math.ceil(rMax);
    const tMax = mainEarthquake.force < 14.5 ? Math.pow(10, 0.033 * mainEarthquake.force + 0.19) : Math.pow(10, 0.17 * mainEarthquake.force - 1.8);
    const maxDate = new Date(mainEarthquake.date);
    maxDate.setMonth(maxDate.getMonth() + Math.ceil(tMax));

    for (const earthquake of earthquakes) {
      if (
        earthquake.date.getTime() >= mainEarthquake.date.getTime() &&
        earthquake.date.getTime() <= maxDate.getTime() &&
        getKmBetweenCoordinates(
          mainEarthquake,
          earthquake,
        ) <= rMax
      ) {
        nestedMainMarks.push(mainEarthquake);
        earthquakes.splice(index, 1);
        aftershocks.push(
          this.mapEarthquakeEntityToAftershock(earthquake, 1, mainEarthquake.id)
        );

        aftershockTimelines.push({
          sourceId: mainEarthquake.id,
          targetId: `${earthquake.id}`,
          sourcePosition: [earthquake.longitude, earthquake.latitude, 5000],
          targetPosition: [mainEarthquake.longitude, mainEarthquake.latitude, 5000],
          sourceDate: mainEarthquake.date,
          targetDate: earthquake.date,
        });
      }
    }
  }

  return {
    nestedMainMarks,
    aftershocks,
    mainTimelines,
    aftershockTimelines,
  };
}