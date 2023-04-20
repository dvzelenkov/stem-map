import { render } from '@testing-library/react';

import Sphere from './sphere';

describe('Sphere', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<Sphere />);
    expect(baseElement).toBeTruthy();
  });
});
