import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';

export const getHyperweaverConfig = (req, res) => {
  try {
    const data = loadConfig('app');
    if (data?.hyperweaver?.url) {
      return res.send({ hyperweaver: data.hyperweaver });
    }
    return problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('config.hyperweaverNotConfigured'),
    });
  } catch (err) {
    log.error.error('Error getting hyperweaver config:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
