const workerpool = require('workerpool');
const dbscan = require('@cdxoo/dbscan');

function swarms(dataset, epsilon, minimumPoints) {
  function deg2rad(deg) {
    return deg * (Math.PI/180)
  }

  function getKmBetweenCoordinates(
    point1,
    point2,
  ) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(point2.latitude - point1.latitude);
    const dLon = deg2rad(point2.longitude - point1.longitude); 
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(point1.latitude)) *
      Math.cos(deg2rad(point2.latitude)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; // Distance in km
    return d;
  }

  const parseMsToDays = (ms) => {
    return ms / 1000 / 60 / 60 / 24;
  };

  const distanceFunction = (a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    return Math.abs(getKmBetweenCoordinates(a, b) * 1000 + parseMsToDays(dateDiff));
  };

  const { clusters, noise } = dbscan({
    dataset,
    epsilon,
    minimumPoints,
    distanceFunction,
  });
  
  return { clusters, noise };
}

// create a worker and register public functions
workerpool.worker({
  swarms,
});