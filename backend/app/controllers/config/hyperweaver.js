import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';

export const getHyperweaverConfig = (req, res) => {
  try {
    const data = loadConfig('app');
    if (data?.hyperweaver?.url) {
      return res.send({ hyperweaver: data.hyperweaver });
    }
    return res.status(404).send({ message: req.__('config.hyperweaverNotConfigured') });
  } catch (err) {
    log.error.error('Error getting hyperweaver config:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
