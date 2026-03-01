import * as ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';

import App from './app/pages';
import EarthquakesOnline from './app/pages/earthquakes-online';
import TrunkMapPage from './app/pages/trunk-map';

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
    element: <TrunkMapPage />,
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <RouterProvider router={router} />
);
