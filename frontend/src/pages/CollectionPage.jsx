import PropTypes from 'prop-types';
import { useEffect, useMemo } from 'react';

import { collectionShape, pageContextShape } from './itemShape';
import Listing from './Listing';

const CollectionPage = ({ collection, org, member, context }) => {
  const collections = useMemo(() => [collection], [collection]);

  useEffect(() => {
    document.title = org || context.appName;
  }, [org, context.appName]);

  return (
    <Listing
      key={org}
      collections={collections}
      org={org}
      member={member}
      grouped={!org}
      context={context}
    />
  );
};

CollectionPage.propTypes = {
  collection: collectionShape.isRequired,
  org: PropTypes.string.isRequired,
  member: PropTypes.bool.isRequired,
  context: pageContextShape.isRequired,
};

export default CollectionPage;
