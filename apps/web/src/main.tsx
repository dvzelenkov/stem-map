import * as ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';

import StemMapPage from './app/pages/stem-map';
import StemMapCsvPage from './app/pages/stem-map-csv';

if (process.env.NODE_ENV !== 'production') {
  const origMeasure = performance.measure.bind(performance);
  performance.measure = (...args: Parameters<typeof performance.measure>) => {
    try {
      return origMeasure(...args);
    } catch {
      return undefined as unknown as PerformanceMeasure;
    }
  };
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <StemMapPage />,
  },
  {
    path: 'trunk-map',
    element: <StemMapPage />,
  },
  {
    path: 'trunk-map-csv',
    element: <StemMapCsvPage />,
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <RouterProvider router={router} />
);
