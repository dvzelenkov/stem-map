# trunk-map

React library for layer-based trunk graphs on top of `deck.gl`.

## Usage

Import `TrunkMap` and pass a `TrunkMapInputData` object:

```tsx
import { TrunkMap, TrunkMapInputData } from '@study/trunk-map';

const data: TrunkMapInputData = {
  layers: [...],
  trunks: [...],
  copies: 'implicit',
  edges: [...],
};

<TrunkMap data={data} />;
```

## Lint

Run `nx lint trunk-map`.
