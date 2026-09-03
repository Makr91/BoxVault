import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

import { OrgLogo } from '../chrome';

import { collectionShape, pageContextShape } from './itemShape';
import Listing from './Listing';

const OrgPage = ({ collections, org, member, context }) => {
  const [organization, setOrganization] = useState({ key: '', value: null });
  const [primary] = collections;

  useEffect(() => {
    document.title = org;
  }, [org]);

  useEffect(() => {
    let mounted = true;
    primary.adapter
      .getOrganization(org)
      .then(value => {
        if (mounted) {
          setOrganization({ key: org, value });
        }
      })
      .catch(() => {
        if (mounted) {
          setOrganization({ key: org, value: { name: org } });
        }
      });
    return () => {
      mounted = false;
    };
  }, [primary, org]);

  const info = organization.key === org && organization.value ? organization.value : { name: org };
  const header = (
    <>
      <OrgLogo
        org={info}
        size={40}
        className="rounded-circle org-logo-lg"
        fallback={context.orgMark}
      />
      <div className="min-width-0">
        <h2 className="h4 mb-0">{info.displayName || info.name}</h2>
        {info.displayName && info.displayName !== info.name ? (
          <code className="checksum">{info.name}</code>
        ) : null}
        {info.description ? <div className="text-muted small">{info.description}</div> : null}
      </div>
    </>
  );

  return (
    <Listing
      key={org}
      collections={collections}
      org={org}
      member={member}
      grouped={false}
      context={context}
      header={header}
    />
  );
};

OrgPage.propTypes = {
  collections: PropTypes.arrayOf(collectionShape).isRequired,
  org: PropTypes.string.isRequired,
  member: PropTypes.bool.isRequired,
  context: pageContextShape.isRequired,
};

export default OrgPage;
