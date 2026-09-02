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
    <div className="d-flex align-items-center gap-3 mb-3">
      <OrgLogo
        org={info}
        size={40}
        className="rounded-circle org-logo-lg"
        fallback={context.orgMark}
      />
      <div>
        <h2 className="h4 mb-0">{info.name}</h2>
        {info.description ? <div className="text-muted small">{info.description}</div> : null}
      </div>
    </div>
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
