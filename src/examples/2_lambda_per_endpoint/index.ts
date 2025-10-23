import servedots, { PlainNodejsAdapter } from '../../index.js';
import { route as lambda1route } from './lambda1/index.js';
import { route as lambda2route } from './lambda2/index.js';

const api = servedots({
  adapter: new PlainNodejsAdapter(),
  openApi: {
    title: 'Lambda per endpoint approach',
    version: '1.0.0',
    description: 'Example example',
  },
  routes: [lambda1route, lambda2route],
});

// Start the server
api.serve(3000);
