import * as ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';

import App from './app/pages';
import EarthquakesOnline from './app/pages/earthquakes-online';
import StemMapPage from './app/pages/stem-map';
import StemMapCsvPage from './app/pages/stem-map-csv';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: 'earthquakes-online',
    element: <EarthquakesOnline />,
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
