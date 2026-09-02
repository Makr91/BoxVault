import PropTypes from 'prop-types';
import { useEffect } from 'react';

import { collectionShape, pageContextShape } from './itemShape';
import Listing from './Listing';

const HomePage = ({ collections, context, header = null }) => {
  useEffect(() => {
    document.title = context.appName;
  }, [context.appName]);

  return (
    <Listing
      collections={collections}
      org=""
      member={false}
      grouped
      context={context}
      header={header}
    />
  );
};

HomePage.propTypes = {
  collections: PropTypes.arrayOf(collectionShape).isRequired,
  context: pageContextShape.isRequired,
  header: PropTypes.node,
};

export default HomePage;
