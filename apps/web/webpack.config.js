const { composePlugins, withNx } = require('@nrwl/webpack');
const { withReact } = require('@nrwl/react');
const { merge } = require('webpack-merge');

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), withReact(), (config) => {
  // Update the webpack config as needed here.
  // e.g. `config.plugins.push(new MyPlugin())`
  return merge(config, {
    // resolve: {
    //   alias: {
    //     'mapbox-gl': 'maplibre-gl'
    //   }
    // }
  });
});
